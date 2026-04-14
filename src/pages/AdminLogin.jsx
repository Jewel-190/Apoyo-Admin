// ============================================
// FILE: AdminLogin.jsx — Login page
// ============================================
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apoyoLogo from "../assets/apoyo1.png";
import dasmaLogo from "../assets/Dasma.png";
import headphones from "../assets/headphones.png";
import { useAuth } from "../context/AuthContext";

const LAST_PROTECTED_ROUTE_KEY = "apoyo_admin_last_protected_route";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [accountLoggedInWarning, setAccountLoggedInWarning] = useState("");
  const navigate = useNavigate();
  const { signIn, isAuthorizedAdmin, checkAccountCurrentlyLoggedIn, loading } =
    useAuth();

  useEffect(() => {
    if (!loading && isAuthorizedAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthorizedAdmin, loading, navigate]);

  useEffect(() => {
    // Cleanup from previous lockout implementation.
    localStorage.removeItem("apoyo_login_attempts");
    localStorage.removeItem("apoyo_login_lock_until");
  }, []);

  useEffect(() => {
    let isMounted = true;
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setAccountLoggedInWarning("");
      return () => {
        isMounted = false;
      };
    }

    const timerId = window.setTimeout(async () => {
      const isActive = await checkAccountCurrentlyLoggedIn(normalizedEmail);
      if (!isMounted) {
        return;
      }
      setAccountLoggedInWarning(
        isActive ? "This user is logged in on another device/browser." : ""
      );
    }, 300);

    return () => {
      isMounted = false;
      window.clearTimeout(timerId);
    };
  }, [email, checkAccountCurrentlyLoggedIn]);

  const handleLogin = async (e) => {
    e.preventDefault();

    setErrorMessage("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("Email is required.");
      return;
    }

    if (!password.trim()) {
      setErrorMessage("Password is required.");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await signIn({
        email: normalizedEmail,
        password,
        rememberMe,
      });

      if (error) {
        setErrorMessage(error.message || "Invalid credentials.");
        return;
      }

      try {
        window.sessionStorage.removeItem(LAST_PROTECTED_ROUTE_KEY);
      } catch {
        // Ignore storage write failures.
      }

      navigate("/dashboard", { replace: true });
    } catch {
      setErrorMessage("Unable to log in right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Restoring session...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header / Logo Bar */}
      <div className="flex items-center gap-3 px-6 md:px-10 py-4 md:py-6">
        <img src={apoyoLogo} alt="Apoyo Logo" className="h-8 md:h-10 w-auto" />
        <div className="w-px h-8 md:h-10 bg-gray-300 mx-1" />
        <img
          src={dasmaLogo}
          alt="Dasmarinas Logo"
          className="h-8 md:h-10 w-auto"
        />
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col md:flex-row items-center justify-center px-6 md:px-10 gap-10 md:gap-20 py-8 md:py-0">
        {/* Left - Login Form */}
        <div className="w-full max-w-sm">
          <h2
            className="text-3xl md:text-4xl font-bold mb-6"
            style={{
              fontFamily: "'Instrument Sans', sans-serif",
              background: "linear-gradient(to right, #008B88, #87CE60)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Welcome to Apoyo
          </h2>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-700 font-medium">
                Email:
              </label>
              <input
                type="email"
                placeholder="Enter Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="border border-teal-500 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-teal-400 placeholder-gray-400 w-full"
              />
              {accountLoggedInWarning && (
                <p className="text-xs text-amber-600 mt-1">
                  {accountLoggedInWarning}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-700 font-medium">
                Password:
              </label>
              <input
                type="password"
                placeholder="Enter Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="border border-teal-500 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-teal-400 placeholder-gray-400 w-full"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-400"
                />
                Remember me
              </label>
              <a
                href="#"
                className="text-sm font-medium"
                style={{
                  background: "linear-gradient(to right, #008B88, #87CE60)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Forgot Password
              </a>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 py-3 rounded-lg text-white font-semibold text-sm transition-all duration-300 hover:opacity-90 hover:scale-[1.02] hover:shadow-lg active:scale-95 w-full"
              style={{
                background: "linear-gradient(to right, #008B88, #87CE60)",
                opacity: isLoading ? 0.8 : 1,
              }}
            >
              {isLoading ? "Logging in..." : "Log In"}
            </button>

            {errorMessage && (
              <p className="text-sm text-red-500 mt-1">{errorMessage}</p>
            )}
          </form>
        </div>

        {/* Right - Headphones + Tagline */}
        <div className="flex flex-col items-center gap-4 w-full max-w-md text-center">
          <div>
            <h1
              className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight"
              style={{
                fontFamily: "'Instrument Sans', sans-serif",
                background: "linear-gradient(to right, #008B88, #87CE60)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Apoyo Command Center:
            </h1>
            <h1
              className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight"
              style={{
                fontFamily: "'Instrument Sans', sans-serif",
                background: "linear-gradient(to right, #008B88, #87CE60)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Powering Public Service.
            </h1>
          </div>
          <img
            src={headphones}
            alt="Headphones"
            className="w-52 sm:w-64 md:w-80 h-auto"
          />
        </div>
      </div>

      {/* Footer */}
      <div
        className="text-center text-xs sm:text-sm px-6 md:px-10 py-6 md:py-8 max-w-xl mx-auto font-medium"
        style={{
          fontFamily: "'Instrument Sans', sans-serif",
          color: "#008B88",
        }}
      >
        Welcome to the central administrative hub of Project Apoyo. Securely
        manage applications, oversee the distribution of essential services for
        the city of Dasmariñas.
      </div>
    </div>
  );
}
