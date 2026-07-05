const fallbackApiBase = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:8080/api"
  : "/api";

export const API_BASE = import.meta.env.VITE_API_URL || fallbackApiBase;
export const TOKEN_KEY = "hemolink_token";
