import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { post } from "../api/client";
export default function Login({ onLogin }: { onLogin: (u: any) => void }) {
  const [email, setEmail] = useState("employee@example.com"),
    [password, setPassword] = useState("REMOVED_DEMO_PASSWORD"),
    [error, setError] = useState("");
  const nav = useNavigate();
  async function submit(e: any) {
    e.preventDefault();
    try {
      const r = await post("/auth/login", { email, password });
      localStorage.setItem("token", r.accessToken);
      onLogin(r.user);
      nav(
        r.user.role === "ADMIN"
          ? "/admin/dashboard"
          : r.user.role === "MANAGER"
            ? "/manager/dashboard"
            : "/employee/dashboard",
      );
    } catch (e: any) {
      setError(e.response?.data?.message || "Login failed");
    }
  }
  return (
    <div className="login">
      <form className="loginBox" onSubmit={submit}>
        <h1>Employee Work Management</h1>
        <p className="muted">Secure work, attendance and task tracking.</p>
        {error && <div className="alert">{error}</div>}
        <label className="field">
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>
        <label className="field">
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </label>
        <button className="btn" style={{ width: "100%", marginTop: 8 }}>
          Login
        </button>
        <small className="muted">
          Development accounts: admin@example.com / manager@example.com /
          employee@example.com — password REMOVED_DEMO_PASSWORD
        </small>
      </form>
    </div>
  );
}
