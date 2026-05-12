import { useState } from "react";

export default function ParseResume() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      setError(null);
      setResult(null);
    } else {
      setError("Please select a valid PDF file");
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a PDF file first");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("resume", file);

      const response = await fetch("/api/parse-resume", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to parse resume");
      }

      setResult(data.data);
    } catch (err) {
      setError(err.message || "Failed to parse resume");
    } finally {
      setLoading(false);
    }
  };

  const downloadJSON = () => {
    if (!result) return;

    const jsonString = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.name?.replace(/\s+/g, "_") || "resume"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    alert("JSON copied to clipboard!");
  };

  return (
    <div style={{
      maxWidth: 900,
      margin: "40px auto",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      background: "#f9f9f9",
      padding: "30px",
      borderRadius: "12px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
    }}>
      <h1 style={{ textAlign: "center", color: "#333", marginBottom: "10px" }}>
        PDF Resume to JSON Parser
      </h1>
      <p style={{ textAlign: "center", color: "#666", marginBottom: "30px" }}>
        Upload your resume PDF to generate a structured JSON file
      </p>

      <div style={{ 
        background: "#fff", 
        padding: "25px", 
        borderRadius: "8px",
        marginBottom: "20px"
      }}>
        <label style={{ 
          display: "block", 
          fontWeight: "bold", 
          marginBottom: "10px",
          color: "#333"
        }}>
          Select Resume PDF:
        </label>
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          style={{
            padding: "10px",
            borderRadius: "6px",
            border: "2px dashed #ccc",
            width: "100%",
            cursor: "pointer",
            marginBottom: "15px"
          }}
        />

        {file && (
          <div style={{ 
            background: "#e8f5e9", 
            padding: "10px", 
            borderRadius: "6px",
            marginBottom: "15px",
            color: "#2e7d32"
          }}>
            ✓ Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          style={{
            background: loading ? "#9e9e9e" : "#4CAF50",
            color: "#fff",
            border: "none",
            padding: "12px 28px",
            fontSize: "16px",
            fontWeight: "bold",
            borderRadius: "8px",
            cursor: loading || !file ? "not-allowed" : "pointer",
            width: "100%",
            transition: "background 0.15s",
            opacity: loading || !file ? 0.7 : 1
          }}
        >
          {loading ? "Parsing Resume..." : "Parse Resume to JSON"}
        </button>
      </div>

      {error && (
        <div style={{
          background: "#ffebee",
          color: "#c62828",
          padding: "15px",
          borderRadius: "8px",
          marginBottom: "20px",
          border: "1px solid #ef5350"
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{
          background: "#fff",
          padding: "25px",
          borderRadius: "8px"
        }}>
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            marginBottom: "15px"
          }}>
            <h2 style={{ margin: 0, color: "#333" }}>
              Generated JSON
            </h2>
            <div>
              <button
                onClick={copyToClipboard}
                style={{
                  background: "#2196F3",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  marginRight: "10px",
                  fontSize: "14px"
                }}
              >
                📋 Copy
              </button>
              <button
                onClick={downloadJSON}
                style={{
                  background: "#4CAF50",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                💾 Download JSON
              </button>
            </div>
          </div>

          <div style={{
            background: "#f5f5f5",
            padding: "15px",
            borderRadius: "6px",
            maxHeight: "500px",
            overflowY: "auto",
            fontFamily: "monospace",
            fontSize: "13px",
            lineHeight: "1.5"
          }}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>

          <div style={{
            marginTop: "15px",
            padding: "15px",
            background: "#e3f2fd",
            borderRadius: "6px",
            color: "#1565c0"
          }}>
            <strong>Next Steps:</strong>
            <ol style={{ marginBottom: 0, paddingLeft: "20px" }}>
              <li>Download the JSON file</li>
              <li>Save it to the <code>resumes/</code> folder as <code>{result.name?.replace(/\s+/g, "_") || "YourName"}.json</code></li>
              <li>Copy the HTML template and save it to <code>templates/</code> folder</li>
              <li>Restart the dev server</li>
              <li>Your resume will appear in the dropdown on the main page!</li>
            </ol>
          </div>
        </div>
      )}

      <div style={{ 
        marginTop: "30px", 
        textAlign: "center" 
      }}>
        <a 
          href="/"
          style={{
            color: "#2196F3",
            textDecoration: "none",
            fontSize: "14px"
          }}
        >
          ← Back to Resume Generator
        </a>
      </div>
    </div>
  );
}

