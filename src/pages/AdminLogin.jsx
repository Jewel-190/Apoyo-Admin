// ============================================
// FILE: AdminLogin.jsx — Login page
// ============================================
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apoyoLogoFallback from "../assets/apoyo1.png";
import dasmaLogoFallback from "../assets/Dasma.png";
import headphones from "../assets/headphones.png";
import { BrandChrome } from "../shared/components/BrandChrome";
import { useAuth } from "../shared/context/AuthContext";

// Client-side brute-force throttle. After MAX_FAILED_ATTEMPTS consecutive
// failures the form locks for LOCKOUT_DURATION_MS. Persisted in localStorage so
// a page reload can't trivially reset it. Real rate limiting is enforced by
// Supabase Auth server-side; this is a UX guard on top of that.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15_000;
const ATTEMPTS_KEY = "apoyo_admin_login_attempts";
const LOCK_UNTIL_KEY = "apoyo_admin_login_lock_until";

function readNumber(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeNumber(key, value) {
  try {
    if (value) {
      window.localStorage.setItem(key, String(value));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage write failures.
  }
}

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lockUntil, setLockUntil] = useState(() => readNumber(LOCK_UNTIL_KEY));
  const [now, setNow] = useState(() => Date.now());
  const navigate = useNavigate();
  const { signIn, isAuthorizedAdmin, isAuthorizedSuperadmin, loading } = useAuth();

  const isLocked = lockUntil > now;
  const remainingSeconds = isLocked ? Math.ceil((lockUntil - now) / 1000) : 0;

  useEffect(() => {
    if (loading) {
      return;
    }

    if (isAuthorizedSuperadmin) {
      navigate("/superadmin/dashboard", { replace: true });
      return;
    }

    if (isAuthorizedAdmin) {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [isAuthorizedAdmin, isAuthorizedSuperadmin, loading, navigate]);

  // Tick the countdown only while a lockout is active.
  useEffect(() => {
    if (lockUntil <= Date.now()) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockUntil) {
        setLockUntil(0);
        writeNumber(LOCK_UNTIL_KEY, 0);
        writeNumber(ATTEMPTS_KEY, 0);
        window.clearInterval(timerId);
      }
    }, 250);

    return () => window.clearInterval(timerId);
  }, [lockUntil]);

  const registerFailedAttempt = useCallback(() => {
    const attempts = readNumber(ATTEMPTS_KEY) + 1;

    if (attempts >= MAX_FAILED_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_DURATION_MS;
      writeNumber(ATTEMPTS_KEY, 0);
      writeNumber(LOCK_UNTIL_KEY, until);
      setLockUntil(until);
      setNow(Date.now());
    } else {
      writeNumber(ATTEMPTS_KEY, attempts);
    }
  }, []);

  const clearFailedAttempts = useCallback(() => {
    writeNumber(ATTEMPTS_KEY, 0);
    writeNumber(LOCK_UNTIL_KEY, 0);
    setLockUntil(0);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (isLocked) {
      return;
    }

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
      const { data, error } = await signIn({
        email: normalizedEmail,
        password,
        rememberMe,
      });

      if (error) {
        registerFailedAttempt();
        setErrorMessage(error.message || "Invalid credentials.");
        return;
      }

      clearFailedAttempts();

      // Redirect based on server-authorized privilege.
      if (data?.profile?.is_super_admin === true) {
        navigate("/superadmin/dashboard", { replace: true });
      } else {
        navigate("/admin/dashboard", { replace: true });
      }
    } catch {
      registerFailedAttempt();
      setErrorMessage("Unable to log in right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const controlsDisabled = isLoading || isLocked || loading;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header / Logo Bar */}
      <div className="flex items-center gap-3 px-6 md:px-10 py-4 md:py-6">
        <BrandChrome
          variant="login-header"
          fallbacks={{
            apoyoLogo: apoyoLogoFallback,
            apoyoBanner: apoyoLogoFallback,
            dasmaLogo: dasmaLogoFallback,
          }}
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
                disabled={controlsDisabled}
                autoComplete="email"
                className="border border-teal-500 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-teal-400 placeholder-gray-400 w-full disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
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
                disabled={controlsDisabled}
                autoComplete="current-password"
                className="border border-teal-500 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-teal-400 placeholder-gray-400 w-full disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={controlsDisabled}
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
              disabled={controlsDisabled}
              className="mt-2 py-3 rounded-lg text-white font-semibold text-sm transition-all duration-300 hover:opacity-90 hover:scale-[1.02] hover:shadow-lg active:scale-95 w-full disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
              style={{
                background: "linear-gradient(to right, #008B88, #87CE60)",
                opacity: controlsDisabled ? 0.8 : 1,
              }}
            >
              {isLocked
                ? `Try again in ${remainingSeconds}s`
                : isLoading
                ? "Logging in..."
                : "Log In"}
            </button>

            {isLocked ? (
              <p className="text-sm text-amber-600 mt-1">
                Too many failed attempts. Login is locked for {remainingSeconds}{" "}
                second{remainingSeconds === 1 ? "" : "s"}.
              </p>
            ) : (
              errorMessage && (
                <p className="text-sm text-red-500 mt-1">{errorMessage}</p>
              )
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
