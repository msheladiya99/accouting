import { RouterProvider } from "react-router";
import { Toaster } from "react-hot-toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { router } from "./routes";
import { AppProvider } from "./context/AppContext";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { queryClient } from "./api/queryClient";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <AuthProvider>
      <AppProvider>
        <RouterProvider router={router} />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: "#0f172a",
              color: "#f8fafc",
              fontSize: "13px",
              borderRadius: "10px",
              padding: "10px 14px",
              boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3)",
            },
            success: { iconTheme: { primary: "#22c55e", secondary: "#fff" } },
            error: { iconTheme: { primary: "#ef4444", secondary: "#fff" } },
          }}
        />
      </AppProvider>
      </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
