import React, { useState, useEffect } from "react";
import {
  Box, Typography, Button, Card, CardContent, CircularProgress,
  Grid, Avatar, Chip, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, List, ListItem, ListItemAvatar, ListItemText
} from "@mui/material";
import { ArrowBack as ArrowBackIcon, Business as BusinessIcon, Key as KeyIcon } from "@mui/icons-material";
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
  
  // Password reset dialog state
  const [openReset, setOpenReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const fetchDetails = () => {
    setLoading(true);
    axiosClient.get(`/super-admin/companies/${id}`)
      .then(res => {
        // Adapt response structure
        const resData = res.data;
        // The API returns enriched company list or single company object
        // Let's adapt if backend is returning `{ company, users, stats: { ledgersCount } }`
        // Wait, on the backend:
        // `res.json({ company, users, stats: { ledgersCount } })` is not what we returned in backend super-admin.ts!
        // Let's check backend super-admin.ts GET `/companies/:id`.
        // Wait! Let's check:
        // `router.get('/companies/:id', authMiddleware, requireSuperAdmin, ...)`
        // Wait, does `/companies/:id` exist? Let's check!
        // Ah! In backend `super-admin.ts`, we did:
        // No, we didn't add a specific GET `/companies/:id` details endpoint! We only have GET `/companies`.
        // Let's check backend `super-admin.ts` file to see what endpoints we wrote.
        // Wait, let's write a GET `/companies/:id` in backend `super-admin.ts` if we didn't!
        // Let's verify our backend file contents. Yes, in backend `/companies/:id` is missing!
        // Ah! Let's add GET `/companies/:id` to backend `super-admin.ts`!
        // Let's see: what should it return?
        // It should return `{ company, users }`!
        // Let's read `super-admin.ts` to see what endpoints are in there.
        // Let's see: we have:
        // - GET `/companies`
        // - POST `/companies`
        // - PATCH `/companies/:id`
        // - DELETE `/companies/:id`
        // - POST `/companies/:id/reset-password`
        // Yes! We missed the GET `/companies/:id` details route in the backend!
        // Let's make sure we implement both client and backend correctly.
        // First, let's complete the client side file, then we can append the GET `/companies/:id` endpoint on the backend.
        
        setData(res.data);
      })
      .catch(err => {
        console.error("Failed to fetch company details:", err);
        toast.error("Failed to fetch company details");
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
    axiosClient.post(`/super-admin/companies/${id}/reset-password`, { newPassword })
      .then(() => {
        toast.success("Admin password reset successfully");
        setOpenReset(false);
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
        <Typography sx={{ color: "#64748b", fontWeight: 700 }}>Company details not found.</Typography>
      </Box>
    );
  }

  const { company, users = [] } = data;

  return (
    <Box className="sa-page" sx={{ maxWidth: 900, mx: "auto" }}>
      {/* Back button */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate("/super-admin/companies")}
        sx={{ mb: 3, textTransform: "none", color: "#64748b", fontWeight: 700 }}
      >
        Back to Companies
      </Button>

      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4, flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Avatar sx={{ width: 48, height: 48, borderRadius: "14px", bgcolor: "#eef2ff", color: "#6366f1", fontSize: "1.25rem", fontWeight: 800 }}>
            {company.companyName?.charAt(0) || "C"}
          </Avatar>
          <Box>
            <Typography sx={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e293b", letterSpacing: -0.5, lineHeight: 1.2 }}>
              {company.companyName}
            </Typography>
            <Typography sx={{ fontFamily: "monospace", fontSize: "0.8rem", color: "#64748b", mt: 0.25 }}>
              {company.subdomain}.localhost
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={<KeyIcon />}
            onClick={() => setOpenReset(true)}
            sx={{ borderRadius: "12px", textTransform: "none", fontWeight: 700, borderColor: "#cbd5e1", color: "#334155" }}
          >
            Reset Admin Password
          </Button>
        </Box>
      </Box>

      {/* Content Grid */}
      <Grid container spacing={3}>
        {/* Company Overview Card */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ borderRadius: "20px", border: "1px solid #f1f5f9", boxShadow: "none" }}>
            <CardContent sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2.5 }}>
              <Typography sx={{ fontWeight: 800, color: "#1e293b", fontSize: "0.95rem", mb: 0.5 }}>
                Company Info
              </Typography>

              <Box>
                <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>PAN Number</Typography>
                <Typography sx={{ fontSize: "0.9rem", color: "#334155", fontWeight: 600, fontFamily: "monospace" }}>{company.panNumber}</Typography>
              </Box>

              <Box>
                <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>Status</Typography>
                <Chip
                  label={company.status?.toUpperCase()}
                  size="small"
                  sx={{
                    bgcolor: company.status === "active" ? "#ecfdf5" : "#fff1f2",
                    color: company.status === "active" ? "#10b981" : "#f43f5e",
                    fontWeight: 700, fontSize: "0.68rem", mt: 0.5
                  }}
                />
              </Box>

              <Box>
                <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>Registered Date</Typography>
                <Typography sx={{ fontSize: "0.9rem", color: "#334155", fontWeight: 600 }}>
                  {new Date(company.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Users List Card */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ borderRadius: "20px", border: "1px solid #f1f5f9", boxShadow: "none" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography sx={{ fontWeight: 800, color: "#1e293b", fontSize: "0.95rem", mb: 2 }}>
                Workspace Users ({users.length})
              </Typography>

              {users.length === 0 ? (
                <Typography sx={{ color: "#94a3b8", py: 4, textAlign: "center" }}>No users registered inside this workspace.</Typography>
              ) : (
                <List sx={{ p: 0 }}>
                  {users.map((u, i) => (
                    <ListItem
                      key={u._id}
                      sx={{
                        px: 0, py: 1.5,
                        borderBottom: i < users.length - 1 ? "1px solid #f8fafc" : "none"
                      }}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: u.role === "Admin" ? "#eef2ff" : "#f1f5f9", color: u.role === "Admin" ? "#6366f1" : "#64748b", fontWeight: 800, fontSize: "0.85rem" }}>
                          {u.name?.charAt(0) || "U"}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Typography sx={{ fontWeight: 700, color: "#1e293b", fontSize: "0.875rem" }}>{u.name}</Typography>
                            {u.role === "Admin" && (
                              <Chip label="Admin" size="small" sx={{ height: 18, fontSize: "0.625rem", bgcolor: "#f5f3ff", color: "#7c3aed", fontWeight: 700 }} />
                            )}
                          </Box>
                        }
                        secondary={u.email}
                      />
                      <Box>
                        <Chip
                          label={u.status}
                          size="small"
                          sx={{
                            height: 20, fontSize: "0.65rem", fontWeight: 700,
                            bgcolor: u.status === "Active" ? "#ecfdf5" : "#f1f5f9",
                            color: u.status === "Active" ? "#10b981" : "#64748b"
                          }}
                        />
                      </Box>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Reset Password Dialog */}
      <Dialog open={openReset} onClose={() => setOpenReset(false)} PaperProps={{ sx: { borderRadius: "20px", p: 1, minWidth: 320 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: "#1e293b" }}>Reset Admin Password</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <Typography sx={{ color: "#64748b", fontSize: "0.875rem" }}>
            This will update the password for all users holding the <strong>Admin</strong> role in the <strong>{company.companyName}</strong> workspace.
          </Typography>
          <TextField
            label="New Password"
            type="password"
            fullWidth
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            variant="outlined"
            InputProps={{ sx: { borderRadius: "12px" } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setOpenReset(false)} sx={{ borderRadius: "12px", textTransform: "none", fontWeight: 700, color: "#64748b" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleResetPassword}
            disabled={resetting}
            sx={{ borderRadius: "12px", textTransform: "none", fontWeight: 700, bgcolor: "#6366f1", "&:hover": { bgcolor: "#4f46e5" }, boxShadow: "none" }}
          >
            {resetting ? "Resetting..." : "Reset Password"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
