import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
});
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export const get = async <T = any>(url: string, params?: any) =>
  (await api.get<T>(url, { params })).data;
export const post = async <T = any>(url: string, data?: any) =>
  (await api.post<T>(url, data)).data;
export const patch = async <T = any>(url: string, data?: any) =>
  (await api.patch<T>(url, data)).data;
export const del = async <T = any>(url: string) =>
  (await api.delete<T>(url)).data;
