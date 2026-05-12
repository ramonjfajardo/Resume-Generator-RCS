import fs from "fs";
import path from "path";

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const templatesDir = path.join(process.cwd(), "templates");
    const files = fs.readdirSync(templatesDir);
    
    // Filter only .html files and create template objects
    const templates = files
      .filter(file => file.endsWith(".html"))
      .map(file => {
        const id = file.replace(".html", "");
        // Convert filename to display name
        // "Resume-Tech-Teal.html" -> "Tech Teal"
        // "Resume.html" -> "Classic (Default)"
        let name;
        if (id === "Resume") {
          name = "Classic (Default)";
        } else {
          name = id
            .replace("Resume-", "")
            .replace(/-/g, " ");
        }
        
        return { id, name, file };
      })
      // Sort so default is first, then alphabetically
      .sort((a, b) => {
        if (a.id === "Resume") return -1;
        if (b.id === "Resume") return 1;
        return a.name.localeCompare(b.name);
      });

    res.status(200).json(templates);
  } catch (error) {
    console.error("Error loading templates:", error);
    res.status(500).json({ error: "Failed to load templates" });
  }
}

