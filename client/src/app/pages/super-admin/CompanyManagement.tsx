import React, { useState, useEffect } from "react";
import {
  Box, Typography, Avatar, Chip, CircularProgress,
  IconButton, TextField, MenuItem, InputAdornment, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
} from "@mui/material";
import {
  Visibility as ViewIcon,
  Block as BlockIcon,
  CheckCircle as CheckIcon,
  Search as SearchIcon,
  Delete as DeleteIcon,
  Business as BusinessIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router";
import axiosClient from "../../api/axiosClient";
import toast from "react-hot-toast";

interface ICompany {
  _id: string;
  companyName: string;
  subdomain: string;
  panNumber: string;
  status: string;
  usersCount: number;
  ledgersCount: number;
  createdAt: string;
}

export default function CompanyManagement() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<ICompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<ICompany | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchCompanies = () => {
    setLoading(true);
    axiosClient.get("/super-admin/firms")
      .then(res => {
        setCompanies(res.data);
      })
      .catch(err => {
        console.error("Failed to load firms:", err);
        toast.error("Failed to load firms");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleToggleStatus = (company: ICompany) => {
    setTogglingId(company._id);
    const newStatus = company.status === "active" ? "suspended" : "active";
    
    axiosClient.patch(`/super-admin/firms/${company._id}`, { status: newStatus })
      .then(() => {
        toast.success(`Firm ${newStatus === "active" ? "activated" : "suspended"}`);
        // Update local state
        setCompanies(prev => prev.map(c => c._id === company._id ? { ...c, status: newStatus } : c));
      })
      .catch(err => {
        console.error("Failed to toggle firm status:", err);
        toast.error("Failed to change status");
      })
      .finally(() => {
        setTogglingId(null);
      });
  };

  const handleDelete = (id: string) => {
    axiosClient.delete(`/super-admin/firms/${id}`)
      .then(() => {
        toast.success("Firm deleted successfully");
        setCompanies(prev => prev.filter(c => c._id !== id));
        setDeleteTarget(null);
      })
      .catch(err => {
        console.error("Failed to delete firm:", err);
        toast.error("Failed to delete firm");
      });
  };

  const filtered = companies.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || 
      c.companyName?.toLowerCase().includes(q) || 
      c.subdomain?.toLowerCase().includes(q) || 
      c.panNumber?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <Box className="sa-page">
      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: "1.4rem", fontWeight: 800, color: "#1e293b", letterSpacing: -0.5 }}>
            Firm Accounts
          </Typography>
          <Typography sx={{ color: "#94a3b8", fontWeight: 500, fontSize: "0.875rem", mt: 0.25 }}>
            {loading ? "—" : `${companies.length} firms registered`} on the SaaS platform
          </Typography>
        </Box>
        <Box
          onClick={() => navigate("/super-admin/firms/create")}
          sx={{
            display: "flex", alignItems: "center", gap: 1,
            bgcolor: "#6366f1", color: "#fff", px: 2.5, py: 1.25,
            borderRadius: "14px", cursor: "pointer", fontWeight: 700, fontSize: "0.875rem",
            transition: "all 0.18s ease",
            "&:hover": { bgcolor: "#4f46e5", transform: "translateY(-1px)", boxShadow: "0 8px 20px rgba(99,102,241,0.3)" },
          }}
        >
          <AddIcon sx={{ fontSize: 18 }} />
          Register New Firm
        </Box>
      </Box>

      {/* Filters */}
      <Box sx={{ display: "flex", gap: 1.5, mb: 2.5, flexWrap: "wrap" }}>
        <TextField
          placeholder="Search firm name, subdomain, PAN..."
          size="small"
          value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: "#94a3b8" }} /></InputAdornment>,
            sx: { borderRadius: "12px", bgcolor: "#fff", border: "1px solid #f1f5f9", "& fieldset": { border: "none" }, fontSize: "0.875rem" }
          }}
          sx={{ flex: 1, minWidth: 220 }}
        />
        <TextField
          select size="small" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          sx={{ minWidth: 160, "& .MuiOutlinedInput-root": { borderRadius: "12px", bgcolor: "#fff", border: "1px solid #f1f5f9", "& fieldset": { border: "none" }, fontSize: "0.875rem" } }}
        >
          <MenuItem value="all">All Status</MenuItem>
          <MenuItem value="active">Active Only</MenuItem>
          <MenuItem value="suspended">Suspended Only</MenuItem>
        </TextField>
      </Box>

      {/* Table */}
      <Box sx={{ bgcolor: "#fff", borderRadius: "20px", border: "1px solid #f1f5f9", overflow: "hidden" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress size={28} sx={{ color: "#6366f1" }} />
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ py: 8, textAlign: "center" }}>
            <BusinessIcon sx={{ fontSize: 44, color: "#e2e8f0", mb: 1.5 }} />
            <Typography sx={{ fontWeight: 700, color: "#64748b" }}>No firms found</Typography>
            <Typography sx={{ color: "#94a3b8", fontSize: "0.875rem", mt: 0.5 }}>Try adjusting your search filters</Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f8fafc" }}>
                  {["Firm Name", "Subdomain", "PAN Number", "Status", "Users / Ledgers", "Registered Date", "Actions"].map(h => (
                    <th key={h} style={{
                      textAlign: h === "Actions" ? "right" : "left",
                      padding: "12px 20px",
                      color: "#94a3b8", fontSize: "0.7rem",
                      fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.05em", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((company, i) => {
                  const isLast = i === filtered.length - 1;
                  return (
                    <tr key={company._id} style={{ borderBottom: isLast ? "none" : "1px solid #f8fafc", transition: "background 0.12s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#fafbff")}
                      onMouseLeave={e => (e.currentTarget.style.background = "")}>
                      {/* Company */}
                      <td style={{ padding: "14px 20px" }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          <Avatar sx={{ width: 34, height: 34, borderRadius: "10px", bgcolor: "#eef2ff", color: "#6366f1", fontWeight: 800, fontSize: "0.875rem" }}>
                            {company.companyName?.charAt(0) || "C"}
                          </Avatar>
                          <Box>
                            <Typography sx={{ fontWeight: 700, color: "#1e293b", fontSize: "0.875rem" }}>{company.companyName}</Typography>
                          </Box>
                        </Box>
                      </td>
                      {/* Subdomain */}
                      <td style={{ padding: "14px 20px" }}>
                        <Typography sx={{ fontFamily: "monospace", fontSize: "0.78rem", fontWeight: 700, color: "#475569", bgcolor: "#f8fafc", px: 1, py: 0.3, borderRadius: "6px", display: "inline-block", whiteSpace: "nowrap" }}>
                          {company.subdomain}.localhost
                        </Typography>
                      </td>
                      {/* PAN */}
                      <td style={{ padding: "14px 20px" }}>
                        <Typography sx={{ fontFamily: "monospace", fontSize: "0.78rem", fontWeight: 600, color: "#64748b" }}>
                          {company.panNumber}
                        </Typography>
                      </td>
                      {/* Status */}
                      <td style={{ padding: "14px 20px" }}>
                        <Box sx={{
                          display: "inline-flex", alignItems: "center", gap: 0.75,
                          bgcolor: company.status === "active" ? "#ecfdf5" : "#fff1f2",
                          color: company.status === "active" ? "#10b981" : "#f43f5e",
                          px: 1.25, py: 0.35, borderRadius: "8px",
                        }}>
                          <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "currentColor" }} />
                          <Typography sx={{ fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>
                            {company.status === "active" ? "Active" : "Suspended"}
                          </Typography>
                        </Box>
                      </td>
                      {/* Metrics */}
                      <td style={{ padding: "14px 20px" }}>
                        <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b" }}>
                          {company.usersCount || 0} Users · {company.ledgersCount || 0} Ledgers
                        </Typography>
                      </td>
                      {/* Date */}
                      <td style={{ padding: "14px 20px", whiteSpace: "nowrap" }}>
                        <Typography sx={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 500 }}>
                          {new Date(company.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </Typography>
                      </td>
                      {/* Actions */}
                      <td style={{ padding: "14px 20px", textAlign: "right" }}>
                        <Box sx={{ display: "flex", gap: 0.75, justifyContent: "flex-end" }}>
                          <Tooltip title="View details">
                            <IconButton size="small" onClick={() => navigate(`/super-admin/firms/${company._id}`)}
                              sx={{ bgcolor: "#f8fafc", color: "#475569", borderRadius: "8px", "&:hover": { bgcolor: "#eef2ff", color: "#6366f1" } }}>
                              <ViewIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={company.status === "active" ? "Suspend Workspace" : "Activate Workspace"}>
                            <IconButton size="small"
                              disabled={togglingId === company._id}
                              onClick={() => handleToggleStatus(company)}
                              sx={{
                                bgcolor: company.status === "active" ? "#fff1f2" : "#ecfdf5",
                                color: company.status === "active" ? "#f43f5e" : "#10b981",
                                borderRadius: "8px", "&:hover": { opacity: 0.8 }
                              }}>
                              {company.status === "active" ? <BlockIcon sx={{ fontSize: 16 }} /> : <CheckIcon sx={{ fontSize: 16 }} />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Permanently Delete">
                            <IconButton size="small" onClick={() => setDeleteTarget(company)}
                              sx={{ bgcolor: "#fdf2f2", color: "#e11d48", borderRadius: "8px", "&:hover": { bgcolor: "#fee2e2" } }}>
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Box>
        )}
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} PaperProps={{ sx: { borderRadius: "20px", p: 1 } }}>
        <DialogTitle sx={{ fontWeight: 800, color: "#1e293b" }}>Delete Firm Workspace?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: "#64748b" }}>
            You are about to permanently delete the workspace for <strong>{deleteTarget?.companyName}</strong> and all its associated accounting data (users, ledgers, accounts, transactions).<br /><br />
            This action <strong>cannot be undone</strong>.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ borderRadius: "12px", textTransform: "none", fontWeight: 700, color: "#64748b" }}>
            Cancel
          </Button>
          <Button
            variant="contained" color="error"
            onClick={() => deleteTarget && handleDelete(deleteTarget._id)}
            sx={{ borderRadius: "12px", textTransform: "none", fontWeight: 700, boxShadow: "none" }}
          >
            Delete Workspace
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
