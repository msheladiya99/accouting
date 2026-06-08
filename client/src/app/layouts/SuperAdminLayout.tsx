import React, { useState } from "react";
import { Outlet, useNavigate, useLocation, Navigate } from "react-router";
import {
  Box, Typography, Avatar, Tooltip, IconButton, Drawer,
  useMediaQuery, useTheme
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  Business as BusinessIcon,
  Logout as LogoutIcon,
  Menu as MenuIcon,
  Close as CloseIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { label: "Dashboard", icon: <DashboardIcon />, path: "/super-admin/dashboard" },
  { label: "Firms", icon: <BusinessIcon />, path: "/super-admin/firms" },
];

const SIDEBAR_W = 240;
const SIDEBAR_W_COLLAPSED = 72;

function SidebarItem({ item, active, collapsed, onClick }: {
  item: typeof NAV[0]; active: boolean; collapsed: boolean; onClick: () => void;
}) {
  return (
    <Tooltip title={collapsed ? item.label : ""} placement="right">
      <Box
        onClick={onClick}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: collapsed ? 1.5 : 2,
          py: 1.25,
          mx: 1,
          borderRadius: "14px",
          cursor: "pointer",
          transition: "all 0.18s ease",
          bgcolor: active ? "rgba(99,102,241,0.1)" : "transparent",
          color: active ? "#6366f1" : "#94a3b8",
          "&:hover": {
            bgcolor: active ? "rgba(99,102,241,0.13)" : "rgba(0,0,0,0.04)",
            color: active ? "#6366f1" : "#475569",
            transform: "translateX(2px)",
          },
          position: "relative",
          overflow: "hidden",
        }}
      >
        {active && (
          <Box sx={{
            position: "absolute", left: 0, top: "25%", height: "50%",
            width: 3, borderRadius: "0 4px 4px 0", bgcolor: "#6366f1",
          }} />
        )}
        <Box sx={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minWidth: 28,
          "& svg": { fontSize: 20 }
        }}>
          {item.icon}
        </Box>
        {!collapsed && (
          <Typography sx={{ fontSize: "0.875rem", fontWeight: active ? 700 : 500, whiteSpace: "nowrap", letterSpacing: -0.2 }}>
            {item.label}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
}

function Sidebar({ collapsed, onToggle, onNavigate, currentPath }: {
  collapsed: boolean; onToggle: () => void; onNavigate: (p: string) => void; currentPath: string;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/superadmin");
  };

  return (
    <Box sx={{
      width: collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W,
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      bgcolor: "#ffffff",
      borderRight: "1px solid #f1f5f9",
      transition: "width 0.2s ease",
      overflowX: "hidden",
      position: "fixed",
      top: 0, left: 0, bottom: 0,
      zIndex: 100,
    }}>
      {/* Logo area */}
      <Box sx={{ px: collapsed ? 1 : 2, pt: 2.5, pb: 2, display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between" }}>
        {!collapsed && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer" }} onClick={() => navigate("/super-admin/dashboard")}>
            <Box sx={{
              width: 34, height: 34, bgcolor: "#6366f1", borderRadius: "10px",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
            }}>
              <Typography sx={{ color: "#fff", fontWeight: 900, fontSize: "1rem", lineHeight: 1 }}>A</Typography>
            </Box>
            <Typography sx={{ fontWeight: 900, fontSize: "1.05rem", color: "#1e293b", letterSpacing: -0.5 }}>
              AccountPro
            </Typography>
          </Box>
        )}
        {collapsed && (
          <Box sx={{
            width: 34, height: 34, bgcolor: "#6366f1", borderRadius: "10px",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
          }} onClick={() => navigate("/super-admin/dashboard")}>
            <Typography sx={{ color: "#fff", fontWeight: 900, fontSize: "1rem" }}>A</Typography>
          </Box>
        )}
        <IconButton onClick={onToggle} size="small" sx={{ color: "#94a3b8", "&:hover": { bgcolor: "#f8fafc" } }}>
          {collapsed ? <MenuIcon fontSize="small" /> : <CloseIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Box sx={{ px: 1, mb: 1 }}>
        <Box sx={{ height: "1px", bgcolor: "#f1f5f9" }} />
      </Box>

      {/* Nav items */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 0.5, py: 1 }}>
        {NAV.map(item => {
          const active = currentPath === item.path || (item.path !== "/super-admin/dashboard" && currentPath.startsWith(item.path));
          return (
            <SidebarItem
              key={item.path}
              item={item}
              active={active}
              collapsed={collapsed}
              onClick={() => onNavigate(item.path)}
            />
          );
        })}
      </Box>

      {/* Quick action */}
      {!collapsed && (
        <Box sx={{ mx: 1, mb: 2 }}>
          <Box
            onClick={() => navigate("/super-admin/create-firm")}
            sx={{
              display: "flex", alignItems: "center", gap: 1.5,
              px: 2, py: 1.25, borderRadius: "14px", cursor: "pointer",
              bgcolor: "#f5f3ff", color: "#6366f1",
              transition: "all 0.18s ease",
              "&:hover": { bgcolor: "#ede9fe" },
            }}
          >
            <AddIcon sx={{ fontSize: 18 }} />
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>Add Firm</Typography>
          </Box>
        </Box>
      )}

      {/* Bottom user section */}
      <Box sx={{ p: collapsed ? 1 : 2, borderTop: "1px solid #f1f5f9" }}>
        {collapsed ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "center" }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: "#6366f1", fontSize: "0.8rem", fontWeight: 800 }}>
              {user?.name?.charAt(0) || "S"}
            </Avatar>
            <Tooltip title="Logout" placement="right">
              <IconButton onClick={handleLogout} size="small" sx={{ color: "#ef4444", "&:hover": { bgcolor: "#fef2f2" } }}>
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ) : (
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
              <Avatar sx={{ width: 36, height: 36, bgcolor: "#6366f1", fontSize: "0.85rem", fontWeight: 800 }}>
                {user?.name?.charAt(0) || "S"}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.8rem", fontWeight: 700, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user?.name || "Super Admin"}
                </Typography>
                <Typography sx={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: 500 }}>
                  Logged In
                </Typography>
              </Box>
              <IconButton onClick={handleLogout} size="small" sx={{ color: "#94a3b8", "&:hover": { color: "#ef4444", bgcolor: "#fef2f2" } }}>
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Box>
            <Box sx={{ bgcolor: "#f8fafc", borderRadius: "10px", px: 1.5, py: 0.75 }}>
              <Typography sx={{ fontSize: "0.65rem", fontWeight: 700, color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase" }}>
                Super Admin Portal
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export const SuperAdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isAuthenticated } = useAuth();

  // Route protection
  if (!isAuthenticated || user?.role !== "SUPER_ADMIN") {
    return <Navigate to="/superadmin" replace />;
  }

  const handleNavigate = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const sidebarWidth = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#f8fafc" }}>
      {/* Desktop Sidebar */}
      {!isMobile && (
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(c => !c)}
          onNavigate={handleNavigate}
          currentPath={location.pathname}
        />
      )}

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          anchor="left"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          PaperProps={{ sx: { width: SIDEBAR_W, border: "none" } }}
        >
          <Sidebar
            collapsed={false}
            onToggle={() => setMobileOpen(false)}
            onNavigate={handleNavigate}
            currentPath={location.pathname}
          />
        </Drawer>
      )}

      {/* Main Content */}
      <Box sx={{
        flex: 1,
        ml: isMobile ? 0 : `${sidebarWidth}px`,
        transition: "margin-left 0.2s ease",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Top bar (mobile) */}
        {isMobile && (
          <Box sx={{
            display: "flex", alignItems: "center", gap: 1.5,
            px: 2, py: 1.5, bgcolor: "#ffffff",
            borderBottom: "1px solid #f1f5f9",
            position: "sticky", top: 0, zIndex: 99,
          }}>
            <IconButton onClick={() => setMobileOpen(true)} size="small">
              <MenuIcon />
            </IconButton>
            <Box sx={{
              width: 28, height: 28, bgcolor: "#6366f1", borderRadius: "8px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Typography sx={{ color: "#fff", fontWeight: 900, fontSize: "0.9rem" }}>A</Typography>
            </Box>
            <Typography sx={{ fontWeight: 900, color: "#1e293b", letterSpacing: -0.5 }}>AccountPro</Typography>
          </Box>
        )}

        <Box sx={{ flex: 1, p: { xs: 2, md: 3 } }}>
          <Outlet />
        </Box>
      </Box>

      <style>{`
        @keyframes sa-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .sa-page { animation: sa-fade-in 0.25s ease; }
      `}</style>
    </Box>
  );
};
