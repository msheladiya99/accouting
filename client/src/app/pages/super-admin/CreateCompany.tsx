import React, { useState } from "react";
import {
  Box, Typography, TextField, Button, Grid, Card, CardContent,
  CircularProgress, Alert, InputAdornment
} from "@mui/material";
import { Business as BusinessIcon, ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import { useNavigate } from "react-router";
import axiosClient from "../../api/axiosClient";
import toast from "react-hot-toast";

export default function CreateCompany() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [firmName, setFirmName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFirmName(val);
    
    // Auto-generate subdomain from company name
    const slug = val
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\-]+/g, "")
      .replace(/\-\-+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "");
    setSubdomain(slug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate PAN
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.toUpperCase())) {
      setError("Invalid PAN Number format (Expected like ABCDE1234F)");
      return;
    }

    setLoading(true);
    try {
      await axiosClient.post("/super-admin/companies", {
        firmName,
        subdomain: subdomain.trim().toLowerCase(),
        panNumber: panNumber.toUpperCase(),
        adminName,
        adminEmail,
        adminPassword
      });

      toast.success("Company and Admin user registered successfully!");
      navigate("/super-admin/companies");
    } catch (err: any) {
      console.error("Failed to create company:", err);
      setError(err?.message || "Failed to create company workspace. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className="sa-page" sx={{ maxWidth: 800, mx: "auto", py: 2 }}>
      {/* Back to list */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate("/super-admin/companies")}
        sx={{ mb: 3, textTransform: "none", color: "#64748b", fontWeight: 700 }}
      >
        Back to Companies
      </Button>

      <Typography sx={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e293b", mb: 0.5, letterSpacing: -0.5 }}>
        Register New Company Workspace
      </Typography>
      <Typography sx={{ color: "#94a3b8", fontWeight: 500, fontSize: "0.875rem", mb: 3 }}>
        Create a new scoped accounting environment and configure its system administrator account.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: "14px" }}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          {/* Company Settings */}
          <Grid item xs={12} md={6}>
            <Card sx={{ borderRadius: "20px", border: "1px solid #f1f5f9", boxShadow: "none" }}>
              <CardContent sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2.5 }}>
                <Typography sx={{ fontWeight: 800, color: "#1e293b", fontSize: "0.95rem", mb: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
                  <BusinessIcon sx={{ color: "#6366f1" }} /> Company Details
                </Typography>

                <TextField
                  label="Company Name"
                  required
                  fullWidth
                  value={firmName}
                  onChange={handleNameChange}
                  placeholder="Acme Corp Ltd."
                  variant="outlined"
                  InputProps={{ sx: { borderRadius: "12px" } }}
                />

                <TextField
                  label="Subdomain URL"
                  required
                  fullWidth
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase())}
                  placeholder="acme"
                  variant="outlined"
                  InputProps={{
                    endAdornment: <InputAdornment position="end">.mycafile.xyz</InputAdornment>,
                    sx: { borderRadius: "12px", fontFamily: "monospace" }
                  }}
                  helperText="Portal URL: [subdomain].mycafile.xyz"
                />

                <TextField
                  label="PAN Number"
                  required
                  fullWidth
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  variant="outlined"
                  inputProps={{ maxLength: 10 }}
                  InputProps={{ sx: { borderRadius: "12px", fontFamily: "monospace", tracking: "0.05em" } }}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Admin User Settings */}
          <Grid item xs={12} md={6}>
            <Card sx={{ borderRadius: "20px", border: "1px solid #f1f5f9", boxShadow: "none" }}>
              <CardContent sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2.5 }}>
                <Typography sx={{ fontWeight: 800, color: "#1e293b", fontSize: "0.95rem", mb: 0.5 }}>
                  👑 Workspace Administrator
                </Typography>

                <TextField
                  label="Administrator Name"
                  required
                  fullWidth
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Aryan Sharma"
                  variant="outlined"
                  InputProps={{ sx: { borderRadius: "12px" } }}
                />

                <TextField
                  label="Admin Email Address"
                  type="email"
                  required
                  fullWidth
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@acmecorp.com"
                  variant="outlined"
                  InputProps={{ sx: { borderRadius: "12px" } }}
                />

                <TextField
                  label="Temporary Password"
                  type="password"
                  required
                  fullWidth
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  variant="outlined"
                  InputProps={{ sx: { borderRadius: "12px" } }}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Submit */}
          <Grid item xs={12} sx={{ display: "flex", justifyContent: "flex-end", gap: 2, pt: 1 }}>
            <Button
              variant="outlined"
              onClick={() => navigate("/super-admin/companies")}
              sx={{ borderRadius: "12px", textTransform: "none", px: 4, py: 1.25, fontWeight: 700, borderColor: "#cbd5e1", color: "#64748b" }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{ borderRadius: "12px", textTransform: "none", px: 4, py: 1.25, fontWeight: 700, bgcolor: "#6366f1", "&:hover": { bgcolor: "#4f46e5" }, boxShadow: "none" }}
            >
              {loading ? <CircularProgress size={20} sx={{ color: "#fff" }} /> : "Register Workspace"}
            </Button>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
}
