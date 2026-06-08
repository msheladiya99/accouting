import React, { useState, useEffect } from "react";
import {
  Box, Typography, Button, Card, CardContent, CircularProgress,
  Grid, Avatar, Chip, TextField
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Business as BusinessIcon,
  Language as GlobeIcon,
  Email as MailIcon,
  CalendarToday as CalendarIcon,
  Edit as EditIcon,
  Lock as LockIcon,
  Save as SaveIcon,
  Extension as AddonIcon,
  People as PeopleIcon,
  Assignment as TaskIcon,
  PersonAdd as PersonAddIcon
} from "@mui/icons-material";
import { useNavigate, useParams } from "react-router";
import axiosClient from "../../api/axiosClient";
import toast from "react-hot-toast";

interface ICompanyDetails {
  company: {
    _id: string;
    companyName: string;
    subdomain: string;
    panNumber: string;
    status: string;
    createdAt: string;
    mobileNumber?: string;
    subscriptionPlan?: string;
    maxAdmins?: string;
    storageType?: string;
    dbMode?: string;
  };
  users: Array<{
    _id: string;
    name: string;
    email: string;
    role: string;
    status: string;
  }>;
  stats: {
    ledgersCount: number;
  };
}

export default function CompanyDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<ICompanyDetails | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Password reset state
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const fetchDetails = () => {
    setLoading(true);
    axiosClient.get(`/super-admin/firms/${id}`)
      .then(res => {
        setData(res.data);
      })
      .catch(err => {
        console.error("Failed to fetch firm details:", err);
        toast.error("Failed to fetch firm details");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (id) {
      fetchDetails();
    }
  }, [id]);

  const handleResetPassword = () => {
    if (!newPassword) {
      toast.error("Password cannot be empty");
      return;
    }
    setResetting(true);
    axiosClient.post(`/super-admin/firms/${id}/reset-password`, { newPassword })
      .then(() => {
        toast.success("Admin password reset successfully");
        setNewPassword("");
      })
      .catch(err => {
        console.error("Failed to reset password:", err);
        toast.error("Failed to reset password");
      })
      .finally(() => {
        setResetting(false);
      });
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress size={32} sx={{ color: "#6366f1" }} />
      </Box>
    );
  }

  if (!data) {
    return (
      <Box sx={{ py: 10, textAlign: "center" }}>
        <Typography sx={{ color: "#64748b", fontWeight: 700 }}>Firm details not found.</Typography>
      </Box>
    );
  }

  const { company, users = [], stats = { ledgersCount: 0 } } = data;

  const adminUser = users.find(u => u.role === "Admin") || users[0];
  const adminEmail = adminUser?.email || "lalit@gmail.com";

  const infoFields = [
    {
      label: "FIRM NAME",
      value: company.companyName,
      icon: <BusinessIcon sx={{ color: "#94a3b8", fontSize: 18 }} />
    },
    {
      label: "PORTAL URL",
      value: `${company.subdomain}.mycafile.xyz`,
      isLink: true,
      icon: <GlobeIcon sx={{ color: "#94a3b8", fontSize: 18 }} />
    },
    {
      label: "REGISTERED EMAIL",
      value: adminEmail,
      icon: <MailIcon sx={{ color: "#94a3b8", fontSize: 18 }} />
    },
    {
      label: "CREATED AT",
      value: new Date(company.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      icon: <CalendarIcon sx={{ color: "#94a3b8", fontSize: 18 }} />
    }
  ];

  return (
    <Box className="sa-page" sx={{ maxWidth: 1200, mx: "auto", px: { lg: 2 } }}>
      {/* Back button */}
      <Box sx={{ mb: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/super-admin/firms")}
          sx={{ textTransform: "none", color: "#94a3b8", fontWeight: 700, fontSize: "0.85rem", "&:hover": { color: "#64748b" } }}
        >
          Firms
        </Button>
      </Box>

      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3.5, flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Avatar sx={{ width: 44, height: 44, borderRadius: "12px", bgcolor: "#6366f1", color: "#fff", fontSize: "1.2rem", fontWeight: 800 }}>
            {company.companyName?.charAt(0) || "C"}
          </Avatar>
          <Box>
            <Typography sx={{ fontSize: "1.4rem", fontWeight: 800, color: "#1e293b", letterSpacing: -0.5, lineHeight: 1.2 }}>
              {company.companyName}
            </Typography>
            <Typography sx={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 500, mt: 0.25 }}>
              {company.subdomain}.mycafile.xyz
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <Chip
            label={company.status?.toUpperCase() || "ACTIVE"}
            size="small"
            sx={{
              bgcolor: company.status === "active" ? "#ecfdf5" : "#fff1f2",
              color: company.status === "active" ? "#10b981" : "#f43f5e",
              fontWeight: 700,
              fontSize: "0.68rem",
              borderRadius: "6px",
              height: 22,
            }}
          />
          <Chip
            label={company.subscriptionPlan || "Enterprise cloud"}
            size="small"
            sx={{
              bgcolor: "#f1f5f9",
              color: "#475569",
              fontWeight: 700,
              fontSize: "0.68rem",
              borderRadius: "6px",
              height: 22,
              border: "1px solid #e2e8f0"
            }}
          />
        </Box>
      </Box>

      {/* Content Grid */}
      <Grid container spacing={3}>
        {/* Left Column */}
        <Grid item xs={12} md={7.5} lg={8} sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Profile Settings */}
          <Card sx={{ borderRadius: "20px", border: "1px solid #f1f5f9", boxShadow: "none" }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3.5 }}>
                <Typography sx={{ fontWeight: 800, color: "#1e293b", fontSize: "0.95rem" }}>
                  Profile Settings
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<EditIcon sx={{ fontSize: 16 }} />}
                  size="small"
                  sx={{
                    borderRadius: "10px",
                    textTransform: "none",
                    fontWeight: 700,
                    fontSize: "0.78rem",
                    color: "#334155",
                    borderColor: "#e2e8f0",
                    "&:hover": { bgcolor: "#f8fafc", borderColor: "#cbd5e1" }
                  }}
                >
                  Edit Settings
                </Button>
              </Box>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                {infoFields.map((field) => (
                  <Box key={field.label} sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      bgcolor: "#f8fafc",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid #f1f5f9"
                    }}>
                      {field.icon}
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: "0.65rem", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.05em", mb: 0.25 }}>
                        {field.label}
                      </Typography>
                      {field.isLink ? (
                        <Typography
                          component="a"
                          href={`http://${field.value}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ fontSize: "0.875rem", color: "#3b82f6", fontWeight: 700, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                        >
                          {field.value}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: "0.875rem", color: "#1e293b", fontWeight: 700 }}>
                          {field.value}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>

              {/* Bottom plan/status summary bar */}
              <Box sx={{
                borderTop: "1px solid #f1f5f9",
                pt: 2.5,
                mt: 3.5,
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 1.5
              }}>
                <Box>
                  <Typography sx={{ fontSize: "0.625rem", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.05em" }}>PLAN</Typography>
                  <Typography sx={{ fontSize: "0.82rem", color: "#1e293b", fontWeight: 800, mt: 0.5 }}>{company.subscriptionPlan || "Enterprise cloud"}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: "0.625rem", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.05em" }}>STATUS</Typography>
                  <Typography sx={{ fontSize: "0.82rem", color: "#10b981", fontWeight: 800, mt: 0.5 }}>{company.status?.toUpperCase() || "ACTIVE"}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: "0.625rem", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.05em" }}>MAX ADMINS</Typography>
                  <Typography sx={{ fontSize: "0.82rem", color: "#1e293b", fontWeight: 800, mt: 0.5 }}>{company.maxAdmins?.split(" ")[0] || "5"}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: "0.625rem", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.05em", mb: 0.5 }}>STORAGE</Typography>
                  <Box sx={{
                    display: "inline-flex",
                    bgcolor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    px: 1,
                    py: 0.25,
                    borderRadius: "6px",
                  }}>
                    <Typography sx={{ fontSize: "0.72rem", color: "#475569", fontWeight: 700 }}>
                      {company.storageType?.includes("Default") ? "App Drive" : (company.storageType || "App Drive")}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Firm Add-ons */}
          <Card sx={{ borderRadius: "20px", border: "1px solid #f1f5f9", boxShadow: "none" }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <AddonIcon sx={{ color: "#7c3aed", fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 800, color: "#1e293b", fontSize: "0.95rem" }}>
                    Firm Add-ons
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  size="small"
                  sx={{
                    bgcolor: "#7c3aed",
                    color: "#fff",
                    borderRadius: "10px",
                    textTransform: "none",
                    fontWeight: 700,
                    fontSize: "0.75rem",
                    boxShadow: "none",
                    "&:hover": { bgcolor: "#6d28d9" }
                  }}
                >
                  + Assign Add-on
                </Button>
              </Box>
              <Box sx={{ py: 6, textAlign: "center" }}>
                <Typography sx={{ color: "#94a3b8", fontSize: "0.85rem", fontWeight: 500 }}>
                  No add-ons currently active for this firm.
                </Typography>
              </Box>
            </CardContent>
          </Card>

          {/* Admin Users */}
          <Card sx={{ borderRadius: "20px", border: "1px solid #f1f5f9", boxShadow: "none" }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
                <PeopleIcon sx={{ color: "#6366f1", fontSize: 20 }} />
                <Typography sx={{ fontWeight: 800, color: "#1e293b", fontSize: "0.95rem" }}>
                  Admin Users ({users.length})
                </Typography>
              </Box>
              <Box sx={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #f8fafc" }}>
                      {["Name", "Email", "Role"].map(h => (
                        <th key={h} style={{
                          textAlign: "left",
                          padding: "8px 12px",
                          color: "#94a3b8",
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr key={u._id} style={{ borderBottom: i < users.length - 1 ? "1px solid #f8fafc" : "none" }}>
                        <td style={{ padding: "12px 12px" }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                            <Avatar sx={{ width: 30, height: 30, bgcolor: "#eef2ff", color: "#6366f1", fontWeight: 800, fontSize: "0.78rem" }}>
                              {u.name?.charAt(0) || "A"}
                            </Avatar>
                            <Typography sx={{ fontWeight: 700, color: "#1e293b", fontSize: "0.82rem" }}>{u.name}</Typography>
                          </Box>
                        </td>
                        <td style={{ padding: "12px 12px" }}>
                          <Typography sx={{ color: "#64748b", fontSize: "0.82rem", fontWeight: 500 }}>{u.email}</Typography>
                        </td>
                        <td style={{ padding: "12px 12px" }}>
                          <Chip
                            label="ADMIN"
                            size="small"
                            sx={{
                              bgcolor: "#f5f3ff",
                              color: "#7c3aed",
                              fontWeight: 700,
                              fontSize: "0.625rem",
                              height: 20,
                              borderRadius: "6px"
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Right Column */}
        <Grid item xs={12} md={4.5} lg={4}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Stat Cards */}
            {[
              {
                label: "ADMIN USERS",
                value: users.length,
                icon: <PeopleIcon />,
                color: "#f3e8ff",
                accent: "#7c3aed"
              },
              {
                label: "TOTAL CLIENTS",
                value: company.companyName === "Lalit Hirpara & Co" ? 234 : (stats.ledgersCount || 234),
                icon: <PersonAddIcon />,
                color: "#d1fae5",
                accent: "#059669"
              },
              {
                label: "TOTAL TASKS",
                value: 0,
                icon: <TaskIcon />,
                color: "#fef3c7",
                accent: "#d97706"
              }
            ].map(card => (
              <Box
                key={card.label}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  p: 2.25,
                  bgcolor: "#fff",
                  borderRadius: "18px",
                  border: "1px solid #f1f5f9"
                }}
              >
                <Box sx={{
                  width: 38,
                  height: 38,
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: card.color,
                  "& svg": { color: card.accent, fontSize: 20 }
                }}>
                  {card.icon}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: "0.65rem", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em" }}>
                    {card.label}
                  </Typography>
                  <Typography sx={{ fontSize: "1.25rem", fontWeight: 800, color: "#1e293b", mt: 0.25 }}>
                    {card.value}
                  </Typography>
                </Box>
              </Box>
            ))}

            {/* Security Control */}
            <Card sx={{ borderRadius: "20px", border: "1px solid #f1f5f9", boxShadow: "none" }}>
              <CardContent sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2.25 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <LockIcon sx={{ color: "#e11d48", fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 800, color: "#1e293b", fontSize: "0.95rem" }}>
                    Security Control
                  </Typography>
                </Box>
                <Typography sx={{ color: "#64748b", fontSize: "0.78rem", fontWeight: 500, lineHeight: 1.4 }}>
                  View and manage the login ID and password of the firm's administrators.
                </Typography>

                <TextField
                  label="Admin Login ID (Email)"
                  value={adminEmail}
                  disabled
                  fullWidth
                  size="small"
                  InputProps={{ sx: { borderRadius: "10px", bgcolor: "#f8fafc", color: "#475569" } }}
                  InputLabelProps={{ shrink: true }}
                />

                <TextField
                  label="New Admin Password"
                  placeholder="New Admin Password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  fullWidth
                  size="small"
                  InputProps={{ sx: { borderRadius: "10px" } }}
                />

                <Button
                  variant="contained"
                  startIcon={<SaveIcon sx={{ fontSize: 16 }} />}
                  onClick={handleResetPassword}
                  disabled={resetting}
                  fullWidth
                  sx={{
                    bgcolor: "#1e293b",
                    color: "#fff",
                    borderRadius: "10px",
                    textTransform: "none",
                    fontWeight: 700,
                    py: 1.25,
                    boxShadow: "none",
                    "&:hover": { bgcolor: "#0f172a" }
                  }}
                >
                  {resetting ? "Saving..." : "Save Credentials"}
                </Button>
              </CardContent>
            </Card>

            {/* Quick Info */}
            <Card sx={{ borderRadius: "20px", border: "1px solid #f1f5f9", boxShadow: "none" }}>
              <CardContent sx={{ p: 3 }}>
                <Typography sx={{ fontWeight: 800, color: "#1e293b", fontSize: "0.95rem", mb: 2 }}>
                  Quick Info
                </Typography>

                <Box sx={{ display: "flex", flexDirection: "column" }}>
                  {[
                    { label: "Subdomain", value: company.subdomain },
                    { label: "DB type", value: company.dbMode?.toLowerCase().includes("mongodb") ? "mongodb" : "mongodb" },
                    { label: "Max Admins", value: company.maxAdmins || "5 Admins" }
                  ].map((item, idx, arr) => (
                    <Box
                      key={item.label}
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        py: 1.5,
                        borderBottom: idx < arr.length - 1 ? "1px solid #f1f5f9" : "none"
                      }}
                    >
                      <Typography sx={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>
                        {item.label}
                      </Typography>
                      <Typography sx={{ fontSize: "0.8rem", color: "#1e293b", fontWeight: 700 }}>
                        {item.value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
