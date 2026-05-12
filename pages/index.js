import { useState, useEffect } from "react";

export default function Home() {
  const [profiles, setProfiles] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("Resume");
  const [jd, setJd] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [disable, setDisable] = useState(false);

  // Load profiles and templates on mount
  useEffect(() => {
    fetch("/api/profiles")
      .then(res => res.json())
      .then(data => setProfiles(data))
      .catch(err => console.error("Failed to load profiles:", err));
    
    fetch("/api/templates")
      .then(res => res.json())
      .then(data => setTemplates(data))
      .catch(err => console.error("Failed to load templates:", err));
  }, []);


  const generatePDF = async () => {
    if (disable) return;
    if (!selectedProfile) return alert("Please select a profile");
    if (!jd) return alert("Please enter the Job Description");
    if (!jobTitle) return alert("Please enter the Job Title");
    if (!companyName) return alert("Please enter the Company Name");

    setDisable(true);

    try {
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          profile: selectedProfile,
          jd: jd,
          template: selectedTemplate,
          jobTitle: jobTitle,
          companyName: companyName
        })
      });

      if (!genRes.ok) {
        const errorText = await genRes.text();
        console.error('Error response:', errorText);
        
        throw new Error(errorText || "Failed to generate PDF");
      }

      const blob = await genRes.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      // Compute filename as Name_company name_job title.pdf
      const profile = profiles.find(p => p.id === selectedProfile);
      const profileName = profile ? profile.name : "Profile";
      
      // Sanitize each part: remove spaces within section, remove special chars, keep only alphanumeric
      const sanitize = (str) => str ? str.replace(/\s+/g, "").replace(/[^A-Za-z0-9]/g, "") : "";
      const sanitizedName = sanitize(profileName);
      const sanitizedCompany = sanitize(companyName);
      const sanitizedJobTitle = sanitize(jobTitle);
      
      // Build filename: Name_company name_job title (underscores only between sections)
      let baseName = sanitizedName;
      if (sanitizedCompany) baseName += `_${sanitizedCompany}`;
      if (sanitizedJobTitle) baseName += `_${sanitizedJobTitle}`;
      
      const fileName = `${baseName}.pdf`;
      a.download = fileName;
      
      a.click();
      window.URL.revokeObjectURL(url);

      // alert("✅ Resume generated successfully!");
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setDisable(false);
    }
  };

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #0a0f1c;
          min-height: 100vh;
        }
        
        ::selection {
          background: #22d3ee;
          color: #0a0f1c;
        }
        
        /* Custom scrollbar */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #1a1f2e;
        }
        ::-webkit-scrollbar-thumb {
          background: #3b4563;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #4b5573;
        }
      `}</style>
      
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0a0f1c 0%, #111827 50%, #0f172a 100%)",
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Animated background elements */}
        <div style={{
          position: "absolute",
          top: "-50%",
          left: "-20%",
          width: "600px",
          height: "600px",
          background: "radial-gradient(circle, rgba(34, 211, 238, 0.08) 0%, transparent 70%)",
          borderRadius: "50%",
          pointerEvents: "none"
        }} />
        <div style={{
          position: "absolute",
          bottom: "-30%",
          right: "-10%",
          width: "500px",
          height: "500px",
          background: "radial-gradient(circle, rgba(16, 185, 129, 0.06) 0%, transparent 70%)",
          borderRadius: "50%",
          pointerEvents: "none"
        }} />
        
        {/* Grid pattern overlay */}
        <div style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
          pointerEvents: "none"
        }} />
        
        <div style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "40px 20px"
        }}>
          <div style={{
            maxWidth: "720px",
            width: "100%",
            background: "rgba(17, 24, 39, 0.8)",
            backdropFilter: "blur(20px)",
            borderRadius: "24px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "0 25px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
            padding: "48px"
          }}>
            
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: "40px" }}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "16px"
              }}>
                <div style={{
                  width: "48px",
                  height: "48px",
                  background: "linear-gradient(135deg, #22d3ee 0%, #10b981 100%)",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                  boxShadow: "0 8px 32px rgba(34, 211, 238, 0.3)"
                }}>
                  ⚡
                </div>
                <h1 style={{
                  fontSize: "32px",
                  fontWeight: "700",
                  background: "linear-gradient(135deg, #f1f5f9 0%, #94a3b8 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  letterSpacing: "-0.5px"
                }}>
                  Resume Tailor
                </h1>
              </div>
              <p style={{
                fontSize: "15px",
                color: "#64748b",
                maxWidth: "400px",
                margin: "0 auto",
                lineHeight: "1.6"
              }}>
                AI-powered resume optimization. Select profile, choose template, paste JD.
              </p>
            </div>

            {/* Form */}
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              
              {/* Profile & Template Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {/* Profile Selection */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#94a3b8",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}>
                    Profile
                  </label>
                  <select
                    value={selectedProfile}
                    onChange={(e) => setSelectedProfile(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      fontSize: "15px",
                      fontFamily: "inherit",
                      color: selectedProfile ? "#f1f5f9" : "#64748b",
                      background: "rgba(30, 41, 59, 0.5)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "12px",
                      outline: "none",
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#22d3ee";
                      e.target.style.boxShadow = "0 0 0 3px rgba(34, 211, 238, 0.1)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(255, 255, 255, 0.1)";
                      e.target.style.boxShadow = "none";
                    }}
                  >
                    <option value="">Select profile...</option>
                    {profiles.map(profile => (
                      <option key={profile.id} value={profile.id} style={{ background: "#1e293b", color: "#f1f5f9" }}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Template Selection */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#94a3b8",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}>
                    Template
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      fontSize: "15px",
                      fontFamily: "inherit",
                      color: "#f1f5f9",
                      background: "rgba(30, 41, 59, 0.5)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "12px",
                      outline: "none",
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#22d3ee";
                      e.target.style.boxShadow = "0 0 0 3px rgba(34, 211, 238, 0.1)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(255, 255, 255, 0.1)";
                      e.target.style.boxShadow = "none";
                    }}
                  >
                    {templates.map(template => (
                      <option key={template.id} value={template.id} style={{ background: "#1e293b", color: "#f1f5f9" }}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Job Title & Company Name Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {/* Job Title */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#94a3b8",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}>
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g., Software Engineer"
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      fontSize: "15px",
                      fontFamily: "inherit",
                      color: jobTitle ? "#f1f5f9" : "#64748b",
                      background: "rgba(30, 41, 59, 0.5)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "12px",
                      outline: "none",
                      transition: "all 0.2s ease"
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#22d3ee";
                      e.target.style.boxShadow = "0 0 0 3px rgba(34, 211, 238, 0.1)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(255, 255, 255, 0.1)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                </div>

                {/* Company Name */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#94a3b8",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}>
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g., Google"
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      fontSize: "15px",
                      fontFamily: "inherit",
                      color: companyName ? "#f1f5f9" : "#64748b",
                      background: "rgba(30, 41, 59, 0.5)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "12px",
                      outline: "none",
                      transition: "all 0.2s ease"
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#22d3ee";
                      e.target.style.boxShadow = "0 0 0 3px rgba(34, 211, 238, 0.1)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(255, 255, 255, 0.1)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                </div>
              </div>

              {/* Job Description */}
              <div>
                <label style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "#94a3b8",
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}>
                  Job Description
                </label>
                <textarea
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="Paste the full job description here..."
                  rows="10"
                  style={{
                    width: "100%",
                    padding: "16px",
                    fontSize: "14px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "#e2e8f0",
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    outline: "none",
                    resize: "vertical",
                    minHeight: "200px",
                    lineHeight: "1.7",
                    transition: "all 0.2s ease"
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#22d3ee";
                    e.target.style.boxShadow = "0 0 0 3px rgba(34, 211, 238, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(255, 255, 255, 0.1)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              {/* Generate Button */}
              <button
                onClick={generatePDF}
                disabled={disable}
                style={{
                  width: "100%",
                  padding: "18px 24px",
                  fontSize: "16px",
                  fontWeight: "600",
                  fontFamily: "inherit",
                  color: disable ? "#64748b" : "#0a0f1c",
                  background: disable 
                    ? "rgba(51, 65, 85, 0.5)" 
                    : "linear-gradient(135deg, #22d3ee 0%, #10b981 100%)",
                  border: "none",
                  borderRadius: "12px",
                  cursor: disable ? "not-allowed" : "pointer",
                  transition: "all 0.3s ease",
                  boxShadow: disable ? "none" : "0 8px 32px rgba(34, 211, 238, 0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px"
                }}
                onMouseEnter={(e) => {
                  if (!disable) {
                    e.target.style.transform = "translateY(-2px)";
                    e.target.style.boxShadow = "0 12px 40px rgba(34, 211, 238, 0.35)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow = disable ? "none" : "0 8px 32px rgba(34, 211, 238, 0.25)";
                }}
              >
                {disable ? (
                  <>
                    <span style={{
                      width: "20px",
                      height: "20px",
                      border: "2px solid transparent",
                      borderTopColor: "#64748b",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite"
                    }} />
                    Generating Resume...
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: "18px" }}>→</span>
                    Generate Tailored Resume
                  </>
                )}
              </button>
            </div>

            {/* Info Section */}
            <div style={{
              marginTop: "32px",
              padding: "20px",
              background: "rgba(30, 41, 59, 0.3)",
              borderRadius: "12px",
              border: "1px solid rgba(255, 255, 255, 0.05)"
            }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "16px",
                textAlign: "center"
              }}>
                <div>
                  <div style={{ fontSize: "24px", marginBottom: "8px" }}>🎯</div>
                  <div style={{ fontSize: "13px", color: "#94a3b8", fontWeight: "500" }}>ATS Optimized</div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>95-100% Score</div>
                </div>
                <div>
                  <div style={{ fontSize: "24px", marginBottom: "8px" }}>⚡</div>
                  <div style={{ fontSize: "13px", color: "#94a3b8", fontWeight: "500" }}>AI Powered</div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>GPT-5-mini</div>
                </div>
                <div>
                  <div style={{ fontSize: "24px", marginBottom: "8px" }}>📄</div>
                  <div style={{ fontSize: "13px", color: "#94a3b8", fontWeight: "500" }}>11 Templates</div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>Professional Styles</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
