import chromium from "@sparticuz/chromium";
import puppeteerCore from "puppeteer-core";
import puppeteer from "puppeteer";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Call GPT with timeout & retries
async function callGPT(promptOrMessages, model = null, maxTokens = 8000, retries = 2, timeoutMs = 180000) {
  const resolvedModel = model || process.env.OPENAI_MODEL || "gpt-5-mini";
  while (retries > 0) {
    try {
      let messages;
      if (typeof promptOrMessages === "string") {
        messages = [{ role: "user", content: promptOrMessages }];
      } else if (Array.isArray(promptOrMessages)) {
        messages = promptOrMessages.map((msg) => ({
          role: msg.role === "system" ? "system" : msg.role === "assistant" ? "assistant" : "user",
          content: msg.content,
        }));
      } else {
        messages = [{ role: "user", content: String(promptOrMessages) }];
      }

      const response = await Promise.race([
        openai.chat.completions.create({
          model: resolvedModel,
          max_completion_tokens: maxTokens,
          messages,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("OpenAI request timed out")), timeoutMs)
        ),
      ]);
      return response;
    } catch (err) {
      retries--;
      if (retries === 0) throw err;
      console.log(`Retrying... (${retries} attempts left)`);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const { profile, jd, template, jobTitle, companyName } = req.body;

    if (!profile) return res.status(400).send("Profile required");
    if (!jd) return res.status(400).send("Job description required");
    
    // Default to Resume.html if no template specified
    const templateName = template || "Resume";

    // Load profile JSON
    console.log(`Loading profile: ${profile}`);
    const profilePath = path.join(process.cwd(), "resumes", `${profile}.json`);
    
    if (!fs.existsSync(profilePath)) {
      return res.status(404).send(`Profile "${profile}" not found`);
    }
    
    const profileData = JSON.parse(fs.readFileSync(profilePath, "utf-8"));


    // Calculate years of experience
    const calculateYears = (experience) => {
      if (!experience || experience.length === 0) return 0;
      
      const parseDate = (dateStr) => {
        if (dateStr.toLowerCase() === "present") return new Date();
        return new Date(dateStr);
      };
      
      const earliest = experience.reduce((min, job) => {
        const date = parseDate(job.start_date);
        return date < min ? date : min;
      }, new Date());
      
      const years = (new Date() - earliest) / (1000 * 60 * 60 * 24 * 365);
      return Math.round(years);
    };

    const yearsOfExperience = calculateYears(profileData.experience);

    // Build base resume text for the prompt (name, contact, experience, education)
    const baseResume = [
      profileData.name,
      [profileData.email, profileData.phone, profileData.location].filter(Boolean).join(" | "),
      "",
      "PROFESSIONAL EXPERIENCE",
      ...profileData.experience.map(
        (j) =>
          `${j.title || "Role"} at ${j.company}${j.location ? ", " + j.location : ""} | ${j.start_date} - ${j.end_date}`
      ),
      "",
      "EDUCATION",
      ...profileData.education.map(
        (e) => `${e.degree}, ${e.school} (${e.start_year}-${e.end_year})${e.grade ? " | " + e.grade : ""}`
      ),
    ].join("\n");

    const resumePromptTemplate = `ATS optimization expert. Generate resume JSON: {"title":"...","summary":"...","skills":{...},"experience":[...]}

**OUTPUT: ONLY valid JSON, no markdown/explanations. Return ONLY the JSON object, nothing else.**

**PROFILE:**
Candidate: {{name}} | {{email}} | {{location}}
Experience: {{yearsOfExperience}} years

**WORK HISTORY:**
{{workHistory}}

**EDUCATION:**
{{education}}

**JOB DESCRIPTION:**
{{jobDescription}}

**INSTRUCTIONS:**

**1. DOMAIN KEYWORDS** (10-15 from JD "About Us"): Use in Summary (4-6), Skills (dedicated category), Experience (3-4 bullets).

---

### **2. TITLE**
- **BASE TITLE:** Use the candidate's MOST RECENT job title from their work history (first entry in experience list)
- **CRITICAL RULE - MATCHING LOGIC:** To determine if titles match, normalize both titles by:
  1. Remove seniority indicators: "Senior", "Lead", "Principal", "Staff", "Junior", "Entry-Level" (ignore these words)
  2. Extract core role type: "Full Stack", "Frontend", "Backend", "Software Engineer", "Developer", "Engineer", "Architect", "DevOps", "QA", "AI", etc.
  3. Compare core role types - they MATCH if they refer to the same domain/type, even if wording differs slightly
  
**TITLES MATCH IF:**
- Both are Full Stack roles: "Senior Full Stack Engineer" = "Full Stack Developer" = "Full Stack Software Engineer" = "Full Stack Engineer" → MATCH
- Both are Frontend roles: "Senior Frontend Engineer" = "Frontend Developer" = "Frontend Software Engineer" → MATCH
- Both are Backend roles: "Senior Backend Engineer" = "Backend Developer" = "Backend Software Engineer" → MATCH
- Both are Software Engineer/Developer (general): "Senior Software Engineer" = "Software Developer" = "Senior Developer" → MATCH
- Both are DevOps roles: "Senior DevOps Engineer" = "DevOps Engineer" = "DevOps Specialist" → MATCH

**TITLES DON'T MATCH IF:**
- Profile is Full Stack, JD is Frontend-only → NO MATCH (add "Frontend Specialist")
- Profile is Frontend, JD is Backend-only → NO MATCH (add "Backend Specialist")
- Profile is Backend, JD is Full Stack → NO MATCH (add "Full Stack Experience")
- Profile is Software Engineer (general), JD is Frontend-specific → NO MATCH (add "Frontend Specialist")

- **If titles MATCH:** Use format: [Profile's Most Recent Title] | [Key Tech 1] | [Key Tech 2] | [Key Tech 3] | [Key Tech 4] (NO specialization added)
- **If titles DON'T match:** Use format: [Profile's Most Recent Title] | [JD-Related Specialization] | [Key Tech 1] | [Key Tech 2] | [Key Tech 3] | [Key Tech 4]

- **JD-Related Specialization (ONLY if titles don't match):** Add 1 specialization/role that aligns with the JD focus (e.g., if applying for frontend job with full stack profile: "Frontend Specialist" or "Frontend Lead")
  - If JD is frontend-focused → "Frontend Specialist" or "Frontend Lead"
  - If JD is backend-focused → "Backend Specialist" or "Backend Architect"
  - If JD is Full Stack-focused → "Full Stack Developer" or "Full Stack Experience"
  - If JD is DevOps-focused → "DevOps Specialist" or "Infrastructure Lead"
  - If JD is QA-focused → "QA Specialist" or "Quality Assurance Lead"
  - If JD is AI-focused → "AI Engineer" or "AI specialist"
  - Match the specialization to the JD's primary focus area

- **Tech Stack:** Extract 4-6 most important technologies/tech stack items from JD (prioritize: frameworks, tools, platforms, methodologies)
- Separate all items with " | " (space-pipe-space)

- **Examples:**
  - Profile: "Senior Full Stack Engineer", JD: "Full Stack Developer" → MATCH → "Senior Full Stack Engineer | React | TypeScript | Next.js | AWS" (NO specialization)
  - Profile: "Full Stack Software Engineer", JD: "Full Stack Developer" → MATCH → "Full Stack Software Engineer | Java | Python | React.js | GCP" (NO specialization)
  - Profile: "Senior Frontend Software Engineer", JD: "Frontend Developer" → MATCH → "Senior Frontend Software Engineer | React | TypeScript | Next.js | AWS" (NO specialization)
  - Profile: "Senior Full Stack Engineer", JD: "Frontend Engineer" → NO MATCH → "Senior Full Stack Engineer | Frontend Specialist | React.js | TypeScript | Next.js | AWS"
  - Profile: "Senior Software Engineer", JD: "Backend Engineer" → NO MATCH → "Senior Software Engineer | Backend Architect | Node.js | Python | Microservices | Docker"
  - Profile: "Senior Frontend Engineer", JD: "Full Stack Developer" → NO MATCH → "Senior Frontend Engineer | Full Stack Experience | React.js | Node.js | PostgreSQL | AWS"

---

**3. SUMMARY** (5-6 lines, 8-10 JD keywords + 3-5 domain): Line 1: [Title] with {{yearsOfExperience}}+ years in [domain]. Line 2: Expertise in [domain keyword] + [3-4 JD techs with versions]. Line 3: Track record in [domain keyword] + [achievement with metric]. Line 4: Proficient in [3-4 more JD techs]. Line 5: [Soft skill] professional with Agile/leadership experience. Line 6: Focus on [2-3 JD skill areas] + scalable solutions.

---

**4. SKILLS** (60-80 total, 5-8 categories): Categories by JD focus (Frontend, Backend, Cloud, DevOps, Security). 8-12 skills/category. Capitalize first letter. NO version spam. Group cloud: "AWS (Lambda, S3, EC2)". 70% JD keywords + 30% complementary. Domain category if relevant (FinTech→"Payment & Compliance", Healthcare→"Healthcare Compliance", Security→"Security & Identity", Data→"Data Governance").

---

**5. EXPERIENCE** ({{experienceCount}} entries, 5-7 bullets each): The **JOB DESCRIPTION IS PRIMARY**. Every bullet must be mapped to 1-3 high-priority JD requirements while still accurately reflecting the candidate's real work history. 5-7 bullets/job (recent=7, older=5). 30-35 words/bullet. 2-4 exact JD keywords/bullet. EVERY bullet needs a metric (%, $, time, scale, users). Industry context in 2-3 bullets/job. Overall targeting **ATS score ≥ 95%**.

**CRITICAL: JD-FIRST, DETAIL-BASED BULLETS (TARGET ATS ≥ 95%)** - ALWAYS treat the JD as the primary source for what to highlight, but the candidate's experience details as the source of truth:
1. **Start from provided Details** - For any job that includes "Details", you MUST derive bullets from those actual accomplishments and responsibilities (do not invent unrelated work).
2. **Align to JD for ATS** - Enhance and tailor each bullet by adding JD-relevant keywords, mapping to JD responsibilities, and ensuring strong metrics, with the explicit goal of achieving **ATS ≥ 95%**.
3. **Maintain authenticity** - Keep the core accomplishments, seniority level, and technologies from the provided details; only refine wording, structure, and keyword usage for ATS optimization.
4. **If no details provided** - Then (and only then) generate bullets based on the job title, company, dates, and JD requirements, ensuring JD alignment and ATS ≥ 95% while staying plausible for that role.

**CRITICAL: TECHNOLOGY RELEASE DATES** - You MUST verify that every technology/framework/tool mentioned in experience bullets was actually available/released during that job's time period. Check the job dates (start_date - end_date) and ONLY use technologies that existed at that time. Examples:
- Angular: Released 2016 → CANNOT use for jobs before 2016
- React: Released 2013 → CANNOT use for jobs before 2013
- TypeScript: Released 2012 → CANNOT use for jobs before 2012
- Vue.js: Released 2014 → CANNOT use for jobs before 2014
- Next.js: Released 2016 → CANNOT use for jobs before 2016
- Docker: Released 2013 → CANNOT use for jobs before 2013
- Kubernetes: Released 2014 → CANNOT use for jobs before 2014
- AWS Lambda: Released 2014 → CANNOT use for jobs before 2014
- GraphQL: Released 2015 → CANNOT use for jobs before 2015
- If unsure about a technology's release date, use generic terms or older alternatives that existed at that time (e.g., for pre-2013 frontend: jQuery, Backbone.js, AngularJS 1.x; for pre-2013 backend: PHP, Java, .NET, Ruby on Rails).

**Bullet:** [Action Verb] + [JD Tech that existed during job period] + [built] + [impact] + [metric]. Verbs: Architected, Engineered, Designed, Built, Developed, Implemented, Optimized, Enhanced, Led, Spearheaded, Automated, Deployed. AVOID: "Responsible for", "Worked on".

**Metrics:** Performance (40% faster, 3x throughput), Scale (50K+ users, 10M+ records), Cost (saved $500K, reduced costs 35%), Time (deployment 2hrs→15min), Quality (99.9% uptime, 90% coverage), Team (led team of 10).

---

**ATS CHECKLIST:** Use EXACT JD phrases (not synonyms). High-priority keywords 3-4x (Skills+Summary+2-3 bullets). All required/preferred JD skills in Skills. Match tech versions. Natural flow, professional tone, varied verbs, strong metrics, domain keywords integrated.

**OUTPUT FORMAT - CRITICAL:**
You MUST return ONLY valid JSON. No markdown, no explanations, no code blocks, no text before or after the JSON.

The JSON structure must be exactly:
{
  "title": "Job Title | Tech1 | Tech2 | Tech3 | Tech4",
  "summary": "4-5 line summary paragraph",
  "skills": {
    "Category1": ["Skill1", "Skill2", "Skill3"],
    "Category2": ["Skill4", "Skill5", "Skill6"]
  },
  "experience": [
    {
      "title": "Job Title",
      "details": [
        "Bullet point 1 with metric",
        "Bullet point 2 with metric",
        "Bullet point 3 with metric"
      ]
    }
  ]
}

**REMEMBER:** Return ONLY the JSON object. Start with { and end with }. No markdown code blocks, no explanations, no other text.
`;

    const prompt = resumePromptTemplate
      .replace(/\$\{baseResume\}/g, baseResume)
      .replace(/\$\{jobDescription\}/g, jd);

    const aiResponse = await callGPT(prompt);

    const finishReason = aiResponse.choices?.[0]?.finish_reason;
    const contentRaw = aiResponse.choices?.[0]?.message?.content ?? "";

    console.log("OpenAI API Response Metadata:");
    console.log("- Model:", aiResponse.model);
    console.log("- Finish reason:", finishReason);
    console.log("- Input tokens:", aiResponse.usage?.prompt_tokens);
    console.log("- Output tokens:", aiResponse.usage?.completion_tokens);

    let content;
    if (finishReason === "length") {
      console.error("⚠️ WARNING: GPT hit max_tokens limit! Response was truncated.");
      console.log("🔄 Retrying with reduced requirements to fit in token limit...");

      const concisePrompt = prompt
        .replace(/8–10 bullets per role/g, "6–8 bullets per role")
        .replace(/NEVER fewer than 8 bullets per role/g, "NEVER fewer than 6 bullets per role");

      const retryResponse = await callGPT(concisePrompt, null, 10000);
      console.log("Retry Response Metadata:");
      console.log("- Finish reason:", retryResponse.choices?.[0]?.finish_reason);
      console.log("- Output tokens:", retryResponse.usage?.completion_tokens);

      content = (retryResponse.choices?.[0]?.message?.content ?? "").trim();
    } else {
      content = contentRaw.trim();
    }
    
    // Check if AI is apologizing instead of returning JSON
    if (content.toLowerCase().startsWith("i'm sorry") || 
        content.toLowerCase().startsWith("i cannot") || 
        content.toLowerCase().startsWith("i apologize")) {
      console.error("AI is apologizing instead of returning JSON:", content.substring(0, 200));
      throw new Error("AI refused to generate resume. The prompt may be too complex. Please try again with a shorter job description or simpler requirements.");
    }
    
    // Enhanced JSON extraction - handle various formats
    // Remove markdown code blocks (case insensitive)
    content = content.replace(/```json\s*/gi, "");
    content = content.replace(/```javascript\s*/gi, "");
    content = content.replace(/```\s*/g, "");
    
    // Remove common prefixes
    content = content.replace(/^(here is|here's|this is|the json is):?\s*/gi, "");
    
    // Try to extract JSON from text if wrapped
    // Look for content between first { and last }
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      content = content.substring(firstBrace, lastBrace + 1);
    } else {
      console.error("No JSON object found in response");
      throw new Error("AI did not return valid JSON format. Please try again.");
    }
    
    content = content.trim();
    
    // Parse JSON with better error handling
    let resumeContent;
    try {
      resumeContent = JSON.parse(content);
    } catch (parseError) {
      console.error("=== JSON PARSE ERROR ===");
      console.error("Parse error:", parseError.message);
      console.error("Content length:", content.length);
      console.error("First 1000 chars:", content.substring(0, 1000));
      console.error("Last 500 chars:", content.substring(Math.max(0, content.length - 500)));
      
      // Try to fix common JSON issues
      try {
        // Remove trailing commas
        let fixedContent = content.replace(/,(\s*[}\]])/g, '$1');
        // Fix unescaped quotes in strings (basic attempt)
        fixedContent = fixedContent.replace(/([^\\])"([^",:}\]]*)":/g, '$1\\"$2":');
        resumeContent = JSON.parse(fixedContent);
        console.log("✅ Successfully parsed after fixing common issues");
      } catch (secondError) {
        console.error("Failed to parse even after fixes");
        throw new Error(`AI returned invalid JSON: ${parseError.message}. Please try again.`);
      }
    }
    
    // Validate required fields
    if (!resumeContent.title || !resumeContent.summary || !resumeContent.skills || !resumeContent.experience) {
      console.error("Missing required fields in AI response:", Object.keys(resumeContent));
      throw new Error("AI response missing required fields (title, summary, skills, or experience)");
    }

    // Title: display only the job title, not "Title at Company"
    if (typeof resumeContent.title === "string" && resumeContent.title.includes(" at ")) {
      resumeContent.title = resumeContent.title.replace(/\s+at\s+.*$/i, "").trim();
    }

    // Summary: if experience > 10 years, show only "more than 10 years", never exact number (12+, 13+, etc.)
    if (yearsOfExperience > 10 && typeof resumeContent.summary === "string") {
      resumeContent.summary = resumeContent.summary.replace(/\b(1[2-9]|[2-9]\d|\d{3})\s*\+\s*years?\b/gi, "more than 10 years");
      resumeContent.summary = resumeContent.summary.replace(/\b(1[2-9]|[2-9]\d|\d{3})\s*years?\b/gi, "more than 10 years");
    }

    // Summary: must start with "Senior Software Engineer"
    if (typeof resumeContent.summary === "string" && !/^Senior Software Engineer/i.test(resumeContent.summary.trim())) {
      const s = resumeContent.summary.trim();
      const rest = s.charAt(0).toLowerCase() + s.slice(1);
      resumeContent.summary = "Senior Software Engineer " + rest;
    }

    // Convert **bold** to <strong> for HTML template
    const boldToStrong = (s) => (typeof s === "string" ? s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>") : s);
    resumeContent.summary = boldToStrong(resumeContent.summary);
    if (Array.isArray(resumeContent.experience)) {
      resumeContent.experience.forEach((exp) => {
        if (Array.isArray(exp.details)) exp.details = exp.details.map(boldToStrong);
      });
    }

    // Skills section: remove ** from category names (e.g. "**Languages**" -> "Languages") so no asterisks display
    if (resumeContent.skills && typeof resumeContent.skills === "object") {
      const skillsClean = {};
      for (const [key, value] of Object.entries(resumeContent.skills)) {
        const cleanKey = typeof key === "string" ? key.replace(/\*/g, "").trim() : key;
        skillsClean[cleanKey || key] = value;
      }
      resumeContent.skills = skillsClean;
    }

    console.log("✅ AI content generated successfully");
    console.log("Skills categories:", Object.keys(resumeContent.skills).length);
    console.log("Experience entries:", resumeContent.experience.length);
    
    // Debug: Check if experience has details
    resumeContent.experience.forEach((exp, idx) => {
      console.log(`Experience ${idx + 1}: ${exp.title || 'NO TITLE'} - Details count: ${exp.details?.length || 0}`);
      if (!exp.details || exp.details.length === 0) {
        console.error(`⚠️ WARNING: Experience entry ${idx + 1} has NO DETAILS!`);
      }
    });

    // Load Handlebars template (dynamic based on user selection)
    const templateFile = `${templateName}.html`;
    const templatePath = path.join(process.cwd(), "templates", templateFile);
    
    if (!fs.existsSync(templatePath)) {
      console.error(`Template not found: ${templateFile}`);
      return res.status(404).send(`Template "${templateName}" not found`);
    }
    
    console.log(`Using template: ${templateFile}`);
    const templateSource = fs.readFileSync(templatePath, "utf-8");
    
    // Register Handlebars helpers
    Handlebars.registerHelper('formatKey', function(key) {
      // Convert keys like "Programming Languages" or "frontend" to proper format
      return key;
    });
    
    Handlebars.registerHelper('join', function(array, separator) {
      // Join array elements with separator
      if (Array.isArray(array)) {
        return array.join(separator);
      }
      return '';
    });
    
    const compiledTemplate = Handlebars.compile(templateSource);

    // Use AI experience when it includes company/dates (e.g. with Cascade Investment); else merge profile + AI by index
    const aiExp = resumeContent.experience || [];
    const hasFullExperience = aiExp.length > 0 && aiExp.every((e) => e.company != null && e.start_date != null && e.end_date != null);
    const experience = hasFullExperience
      ? aiExp.map((e) => ({
          title: e.title || "Engineer",
          company: e.company,
          location: e.location || "",
          start_date: e.start_date,
          end_date: e.end_date,
          details: Array.isArray(e.details) ? e.details : [],
        }))
      : profileData.experience.map((job, idx) => ({
          title: job.title || aiExp[idx]?.title || "Engineer",
          company: job.company,
          location: job.location || "",
          start_date: job.start_date,
          end_date: job.end_date,
          details: aiExp[idx]?.details || [],
        }));

    const templateData = {
      name: profileData.name,
      title: "Senior Software Engineer",
      email: profileData.email,
      phone: profileData.phone,
      location: profileData.location,
      linkedin: profileData.linkedin,
      website: profileData.website,
      summary: resumeContent.summary,
      skills: resumeContent.skills,
      experience,
      education: profileData.education,
    };

    // Render HTML
    const html = compiledTemplate(templateData);
    console.log("HTML rendered from template");

    // Generate PDF with Puppeteer
    const browser = process.env.NODE_ENV === 'production'
      ? await puppeteerCore.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
        })
      : await puppeteer.launch({ headless: "new" });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { 
        top: "15mm", 
        bottom: "15mm", 
        left: "0mm", 
        right: "0mm" 
      },
    });
    await browser.close();

    console.log("PDF generated successfully!");

    // Build safe filename: Name_company name_job title.pdf
    const profileName = profileData.name || 'resume';
    
    // Sanitize each part: remove spaces within section, remove special chars, keep only alphanumeric
    const sanitize = (str) => str ? str.replace(/\s+/g, "").replace(/[^A-Za-z0-9]/g, "") : "";
    const sanitizedName = sanitize(profileName);
    const sanitizedCompany = sanitize(companyName);
    const sanitizedJobTitle = sanitize(jobTitle);
    
    // Build filename: Name_company name_job title (underscores only between sections)
    let baseName = sanitizedName;
    if (sanitizedCompany) baseName += `_${sanitizedCompany}`;
    if (sanitizedJobTitle) baseName += `_${sanitizedJobTitle}`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.pdf"`);
    res.end(pdfBuffer);
    

  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).send("PDF generation failed: " + err.message);
  }
}
