import React, { useState } from "react";
import {
  Box, Typography, TextField, Button, Grid, Card, CardContent,
  CircularProgress, Alert, MenuItem, FormControl, InputLabel, Select
} from "@mui/material";
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
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [subscriptionPlan, setSubscriptionPlan] = useState("Enterprise cloud");
  const [maxAdmins, setMaxAdmins] = useState("5 Admins");
  const [storageType, setStorageType] = useState("Application Drive (Default)");
  const [dbMode, setDbMode] = useState("Default System MongoDB");
  const [adminPassword, setAdminPassword] = useState("");

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFirmName(val);
    
    // Auto-generate subdomain from firm name
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

    // Validate email
    if (!/\S+@\S+\.\S+/.test(adminEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      // Auto-generate a valid PAN number format to satisfy database constraints
      const panNumber = "ABCDE" + Math.floor(1000 + Math.random() * 9000) + "F";

      await axiosClient.post("/super-admin/firms", {
        firmName,
        subdomain: subdomain.trim().toLowerCase(),
        panNumber,
        adminName,
        adminEmail,
        adminPassword,
        mobileNumber,
        subscriptionPlan,
        maxAdmins,
        storageType,
        dbMode
      });

      toast.success("Firm workspace registered successfully!");
      navigate("/super-admin/firms");
    } catch (err: any) {
      console.error("Failed to create firm:", err);
      setError(err?.message || "Failed to create firm workspace. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className="sa-page" sx={{ maxWidth: 840, mx: "auto", py: 2 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: "14px" }}>
          {error}
        </Alert>
      )}

      <Card sx={{ borderRadius: "24px", border: "1px solid #f1f5f9", boxShadow: "none" }}>
        <CardContent sx={{ p: { xs: 3, md: 5 } }}>
          <Typography sx={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e293b", mb: 3.5 }}>
            Create New Firm Account
          </Typography>

          <form onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              {/* Firm Name */}
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Firm Name"
                  required
                  fullWidth
                  value={firmName}
                  onChange={handleNameChange}
                  placeholder="Firm Name"
                  variant="outlined"
                  InputProps={{ sx: { borderRadius: "10px" } }}
                />
              </Grid>

              {/* Subdomain */}
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Subdomain"
                  required
                  fullWidth
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase())}
                  placeholder="Subdomain"
                  variant="outlined"
                  InputProps={{ sx: { borderRadius: "10px" } }}
                  helperText={`Portal URL: ${subdomain || "...."}.mycafile.xyz`}
                  FormHelperTextProps={{ sx: { color: "#94a3b8", fontWeight: 500 } }}
                />
              </Grid>

              {/* Admin Name */}
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Admin Name"
                  required
                  fullWidth
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Admin Name"
                  variant="outlined"
                  InputProps={{ sx: { borderRadius: "10px" } }}
                />
              </Grid>

              {/* Admin Email */}
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Admin Email"
                  required
                  type="email"
                  fullWidth
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="Admin Email"
                  variant="outlined"
                  InputProps={{ sx: { borderRadius: "10px" } }}
                />
              </Grid>

              {/* Mobile Number */}
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Mobile Number"
                  required
                  fullWidth
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="Mobile Number"
                  variant="outlined"
                  InputProps={{ sx: { borderRadius: "10px" } }}
                />
              </Grid>

              {/* Subscription Plan */}
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControl fullWidth variant="outlined">
                  <InputLabel id="subscription-plan-label">Subscription Plan</InputLabel>
                  <Select
                    labelId="subscription-plan-label"
                    value={subscriptionPlan}
                    onChange={(e) => setSubscriptionPlan(e.target.value as string)}
                    label="Subscription Plan"
                    sx={{ borderRadius: "10px" }}
                  >
                    <MenuItem value="Trial">Trial</MenuItem>
                    <MenuItem value="Basic">Basic</MenuItem>
                    <MenuItem value="Professional">Professional</MenuItem>
                    <MenuItem value="Enterprise cloud">Enterprise cloud</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Max Admin Capacity */}
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControl fullWidth variant="outlined">
                  <InputLabel id="max-admins-label">Max Admin Capacity</InputLabel>
                  <Select
                    labelId="max-admins-label"
                    value={maxAdmins}
                    onChange={(e) => setMaxAdmins(e.target.value as string)}
                    label="Max Admin Capacity"
                    sx={{ borderRadius: "10px" }}
                  >
                    <MenuItem value="1 Admin">1 Admin</MenuItem>
                    <MenuItem value="2 Admins">2 Admins</MenuItem>
                    <MenuItem value="5 Admins">5 Admins</MenuItem>
                    <MenuItem value="10 Admins">10 Admins</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Infrastructure Heading */}
              <Grid size={12} sx={{ mt: 2 }}>
                <Typography sx={{ fontWeight: 800, color: "#1e293b", fontSize: "1rem" }}>
                  Infrastructure
                </Typography>
              </Grid>

              {/* Storage Type */}
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControl fullWidth variant="outlined">
                  <InputLabel id="storage-type-label">Data Storage Type</InputLabel>
                  <Select
                    labelId="storage-type-label"
                    value={storageType}
                    onChange={(e) => setStorageType(e.target.value as string)}
                    label="Data Storage Type"
                    sx={{ borderRadius: "10px" }}
                  >
                    <MenuItem value="Application Drive (Default)">Application Drive (Default)</MenuItem>
                    <MenuItem value="S3 Bucket Scoped">S3 Bucket Scoped</MenuItem>
                    <MenuItem value="Local Storage Scoped">Local Storage Scoped</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Database Mode */}
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControl fullWidth variant="outlined">
                  <InputLabel id="db-mode-label">Database Mode</InputLabel>
                  <Select
                    labelId="db-mode-label"
                    value={dbMode}
                    onChange={(e) => setDbMode(e.target.value as string)}
                    label="Database Mode"
                    sx={{ borderRadius: "10px" }}
                  >
                    <MenuItem value="Default System MongoDB">Default System MongoDB</MenuItem>
                    <MenuItem value="MongoDB Dedicated Replica Set">MongoDB Dedicated Replica Set</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Security Heading */}
              <Grid size={12} sx={{ mt: 2 }}>
                <Typography sx={{ fontWeight: 800, color: "#1e293b", fontSize: "1rem" }}>
                  Security
                </Typography>
              </Grid>

              {/* Password */}
              <Grid size={12}>
                <TextField
                  label="Set Admin Password"
                  required
                  type="password"
                  fullWidth
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Set Admin Password"
                  variant="outlined"
                  InputProps={{ sx: { borderRadius: "10px" } }}
                />
              </Grid>

              {/* Action Buttons */}
              <Grid size={12} sx={{ display: "flex", gap: 2, pt: 3 }}>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={loading}
                  sx={{
                    borderRadius: "10px",
                    textTransform: "none",
                    px: 4,
                    py: 1.25,
                    fontWeight: 700,
                    bgcolor: "#6366f1",
                    boxShadow: "none",
                    "&:hover": { bgcolor: "#4f46e5" }
                  }}
                >
                  {loading ? <CircularProgress size={20} sx={{ color: "#fff" }} /> : "Create Firm"}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => navigate("/super-admin/firms")}
                  sx={{
                    borderRadius: "10px",
                    textTransform: "none",
                    px: 4,
                    py: 1.25,
                    fontWeight: 700,
                    borderColor: "#cbd5e1",
                    color: "#64748b",
                    "&:hover": { bgcolor: "#f8fafc", borderColor: "#cbd5e1" }
                  }}
                >
                  Cancel
                </Button>
              </Grid>
            </Grid>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
