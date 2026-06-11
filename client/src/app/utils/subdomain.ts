export const getSubdomain = (): string => {
  const hostname = window.location.hostname;

  // Check if it's localhost or an IP
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    // Check for search query param '?company=XYZ' for easy testing
    const params = new URLSearchParams(window.location.search);
    const companyParam = params.get("company");
    if (companyParam) return companyParam.toLowerCase();

    // Check for port/subdomain format (e.g. acme.localhost)
    // In many local setups, developers access subdomain.localhost
    const parts = hostname.split(".");
    if (parts.length >= 2 && parts[0] !== "localhost") {
      return parts[0].toLowerCase();
    }
    return "";
  }

  // Support local development with .localhost subdomains
  if (hostname.endsWith(".localhost")) {
    const parts = hostname.split(".");
    if (parts.length >= 2 && parts[0] !== "localhost") {
      return parts[0].toLowerCase();
    }
  }
  const parts = hostname.split(".");
  const isCloudProvider = hostname.endsWith(".onrender.com") || 
                          hostname.endsWith(".vercel.app") || 
                          hostname.endsWith(".herokuapp.com");

  if (isCloudProvider) {
    if (parts.length >= 4) {
      const subdomain = parts[0].toLowerCase();
      if (["www", "superadmin", "super-admin", "admin"].includes(subdomain)) {
        return "";
      }
      return subdomain;
    }
    return "";
  }

  // Assuming a domain format like subdomain.company.com
  if (parts.length >= 3) {
    const subdomain = parts[0].toLowerCase();
    if (["www", "superadmin", "super-admin", "admin"].includes(subdomain)) {
      return "";
    }
    return subdomain;
  }

  return "";
};
export const isSuperAdminDomain = (): boolean => {
  const subdomain = getSubdomain();
  return !subdomain;
};
