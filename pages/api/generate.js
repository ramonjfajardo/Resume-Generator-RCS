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

    const resumePromptTemplate = `You are a world-class technical resume assistant.

SYSTEM INSTRUCTION: Make the resume align as closely as possible with the Job Description (JD). Must proactively REPLACE, REPHRASE, and ADD bullet points under each Experience entry, especially recent/current roles, to ensure the language, skills, and technologies match the JD specifically. Do NOT leave any Experience section or bullet point unchanged if it could better reflect or incorporate keywords, duties, or requirements from the JD. Acceptable and encouraged to write NEW bullet points where there are relevant experiences (even if not previously mentioned). Prioritize jobs/roles closest to the desired job.

Your main objectives:
1. Maximize keyword/skills and responsibilities match between the resume and the job description (JD). Use the exact relevant technology, tool, process, or methodology names from the JD wherever accurate.
  1a. Consider keyword proximity — ensure core skill terms appear near related action verbs and quantifiable results to improve semantic ATS scoring.
  1b. Cross-link skills (e.g., "React with TypeScript," "AWS Lambda for automation") to simulate real project context and improve weighted keyword grouping.
  1c. Focus on the required skills, technologies, and ecosystems from the JD regardless of the original resume, and use them to create realistic and relevant bullet points.
2. Preserve all original company names, job titles, and periods/dates in the Professional Experience section.
  2a. INDUSTRY ALIGNMENT: Identify the JD's industry (e.g., fintech, healthcare, retail). For each Experience entry, check whether the company name/type could plausibly belong to that industry:
  - If the company is generic or ambiguous (e.g., "LLC," "Inc.," "Solutions," "Tech Corp," or names that do not clearly indicate a different industry), write the experience bullets and context as if the role were in the JD's industry. Use that industry's terminology, domain, and typical responsibilities where accurate.
  - If the company clearly belongs to another industry (e.g., "State University," "School District," "Hospital System," "Education Corp"), do NOT relabel or reframe the company as the JD's industry. Keep the experience context consistent with that company's actual industry; only align skills, technologies, and transferable duties to the JD.
  2b. FALLBACK ROLE WHEN NO COMPANY FITS JD INDUSTRY: If every company on the resume is clearly tied to an industry that cannot plausibly be the JD's industry (e.g., all are education or healthcare while the JD is fintech), add exactly one part-time role with company name "Cascade Investment" in an appropriate time period (e.g., overlapping or adjacent to existing roles, or in a gap). Place this role in the correct chronological position within the Professional Experience section—i.e., order all roles by date (most recent first) and insert the Cascade Investment entry where its dates fall, not at the end of the list. Use a job title and bullets that fit both retail and the JD's required skills/industry context. Keep the role concise (e.g., 4–6 bullets). Do not add this role if at least one existing company could plausibly be in the JD's industry (e.g., generic LLC/Inc.).
3. In each Experience/job entry, produce 8–10 bullets (one sentence per bullet), each a concise storytelling sentence (challenge → action → result). This is a hard requirement: NEVER fewer than 8 bullets per role. The longest company should have 10 bullets, and the others should have 8–10 bullets according to company period length. Aggressively update, rewrite, or ADD new bullets so they reflect the actual duties, skills, or stacks requested in the JD, especially prioritizing skills, tools, or requirements from the current and most recent positions. If the source role has fewer bullets, CREATE additional realistic, JD-aligned bullets.
4. Make the experiences emphasize the main tech stack from the JD in the most recent or relevant roles, and distribute additional or secondary JD requirements across earlier positions naturally. Each company's experience should collectively cover the full range of JD skills and duties.
Include explicit database-related experience in the Professional Experience section.
5. Place the SKILLS section immediately after the SUMMARY section and before the PROFESSIONAL EXPERIENCE section. This ensures all key stacks and technologies are visible at the top of the resume for ATS and recruiters.
6. In the Summary, integrate the most essential and high-priority skills, stacks, and requirements from the JD, emphasizing the strongest elements from the original. Keep it dense with relevant keywords and technologies, but natural in tone.
7. In every section (Summary, Skills, Experience), INCLUDE as many relevant unique keywords and technologies from the job description as possible.
8. CRITICAL SKILLS SECTION: Create an EXCEPTIONALLY RICH, DENSE, and COMPREHENSIVE Skills section. Extract and list EVERY technology, tool, framework, library, service, and methodology from BOTH the JD AND candidate's experience. Make it so comprehensive it dominates keyword matching.
  8a. Include ecosystems even if not explicitly in the JD but common to that tech stack (e.g., REST, GraphQL, CI/CD).
  8b. Avoid duplicates but prioritize variety (e.g., list both "Docker" and "Containerization").
  8c. List them in STRUCTURE, Order skill groups by the JD's emphasis (frontend-first, backend-first, etc.).

9. Preserve all original quantified metrics (numbers, percentages, etc.) and actively introduce additional quantification in new or reworded bullets wherever possible. Use measurable outcomes, frequency, scope, or scale to increase the impact of each responsibility or accomplishment. Strive for at least 75% of all Experience bullet points to include a number, percentage, range, or scale to strengthen ATS, recruiter, and hiring manager perception.
10. Strictly maximize verb variety: No action verb (e.g., developed, led, built, designed, implemented, improved, created, managed, engineered, delivered, optimized, automated, collaborated, mentored) may appear more than twice in the entire document, and never in adjacent or back-to-back bullet points within or across jobs. Each bullet must start with a unique, action-oriented verb whenever possible.
11. In all Experience bullets, prefer keywords and phrasing directly from the JD where it truthfully reflects the candidate's background and would boost ATS/recruiter relevance.
12. Distribute JD-aligned technologies logically across roles.
- Assign primary/core technologies from the JD to the most recent or relevant positions.
- Assign secondary or supporting technologies to earlier roles.
- Ensure all key JD technologies appear at least once across the resume.

13. Ensure natural tone and realism. Only include technologies or responsibilities that the candidate could reasonably have used, based on their career path or industry.
14. The final resume should read as cohesive, naturally written, and contextually plausible—not artificially optimized.
15. Maintain all original section headers and formatting. Do not include commentary or extra text outside the resume.
16. STYLE CONSTRAINTS:
- No em dashes (—). Use plain connectors (commas, semicolons, "and") or simple hyphens when necessary.
- Use concise storytelling bullets (challenge - action - result) rather than task lists.
- Prefer non-rounded percentages when plausible (e.g., 33%, 47%, 92%) to convey precision.
- Prioritize impact, metrics, and results over generic responsibilities in every bullet.

17. BOLD FORMATTING (**double asterisks**):

BOLD ONLY THESE:
- Technical terms in Summary text and Work Experience bullets (languages, frameworks, tools, databases, cloud services)
- ONLY the category/group label in Skills section (the word before the colon, including the colon)
NEVER BOLD:
- Section headers (Summary, Skills, Work Experience, Education)
- Job titles, company names, dates, or any part of role lines
- ANY individual skills listed after the colon in Skills section - NEVER bold these, they must be plain text
- Education details (degrees, universities, years)

SKILLS SECTION BOLD RULE (CRITICAL):
In the Skills section, ONLY bold the category name before the colon. The skills themselves after the colon must NEVER be bold.
✓ CORRECT: • Languages: JavaScript, TypeScript, Python, SQL, HTML5, CSS3
✗ WRONG: • **Languages:** **JavaScript**, **TypeScript**, **Python**
✗ WRONG: • Languages: **JavaScript**, **TypeScript**, **Python**

EXAMPLES:
✓ Summary: ...expertise in **React**, **Node.js**, and **AWS**...
✓ Software Engineer at RTA: Jul 2024 - Present (no bold anywhere)
✓ • Built APIs using **FastAPI** and **PostgreSQL**
✓ • **Languages:** JavaScript, TypeScript, Python
✓ • **Frontend:** React, Next.js, Vue.js, Tailwind CSS
✗ **Summary:** / **AI/ML Engineer** / **Languages:** **JavaScript**, **Python**

Rule: Each **bold** must start and end on the same line. When in doubt, don't bold.

Here is the base resume:

\${baseResume}

Here is the target job description:

\${jobDescription}

ANTI-DETECTION / HUMANIZATION RULES:

- Vary phrasing styles slightly between sections (avoid repeating identical phrases like "Worked on" or "Responsible for").
- Introduce occasional stylistic imperfections (e.g., omitting articles naturally, slight tense mix in long experiences).
- Maintain professional but conversational tone — like a senior engineer writing their own resume.
- Include subtle domain context or role-specific anecdotes (e.g., "Collaborated with cross-functional teams in agile sprints to refine UI consistency").
- Ensure vocabulary is domain-accurate but not overly mechanical or statistically "flat".
- Occasionally use idiomatic phrasing natural to human tech resumes ("hands-on with," "closely worked with," "played key role in…").

Before outputting, perform a final pass to:

- Smooth transitions between bullets within each job.
- Reduce redundancy across jobs (avoid repeating identical achievements).
- Re-evaluate flow to ensure the document reads naturally aloud.
- Guarantee every section has both high ATS keyword density and human readability balance.

YEARS OF EXPERIENCE IN SUMMARY: If the candidate has more than 10 years of experience, in the Summary refer to it ONLY as "more than 10 years" or "over 10 years". Never use the exact number (e.g. do not write 12+, 13+, 14+, 15+ years).

SUMMARY OPENING: The Summary must always begin with "Senior Software Engineer" (e.g. "Senior Software Engineer with X years..." or "Senior Software Engineer with more than 10 years...").

SUMMARY LENGTH: The Summary must be between 700 and 800 letters. This is a hard requirement. Write a substantial, dense paragraph (or multiple paragraphs) that covers experience, key skills, technologies, achievements, and JD alignment—never fewer than 500 letters.

OUTPUT: Return the improved resume as a single JSON object only (no other text, no markdown). Use this exact structure. Preserve all company names, job titles, and dates from the base resume. Use **bold** for technical terms in summary and in experience details as per your bold rules. Order experience by date (most recent first). Include 8–10 bullets per role in details. If you added a Cascade Investment role, include it in experience with its company, title, dates, and details.

{"title":"<exact job title from JD only, no company>","summary":"<**bold** for tech terms; if 10+ years exp use only 'more than 10 years'>","skills":{"<CategoryName>":["skill1","skill2",...],...},"experience":[{"title":"<job title>","company":"<company name>","location":"<location or empty string>","start_date":"<start>","end_date":"<end>","details":["<bullet with **bold**>",...]}]}`;

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
