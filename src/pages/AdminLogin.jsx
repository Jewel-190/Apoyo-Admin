// ============================================
// FILE: AdminLogin.jsx — Login page
// ============================================
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LOGIN_HERO_URL } from "../shared/lib/staticAssets";
import { BrandChrome } from "../shared/components/BrandChrome";
import { SystemThemeScope } from "../shared/components/SystemThemeScope";
import { useAuth } from "../shared/context/AuthContext";

// Client-side brute-force throttle. After MAX_FAILED_ATTEMPTS consecutive
// failures the form locks for LOCKOUT_DURATION_MS. Persisted in localStorage so
// a page reload can't trivially reset it. Real rate limiting is enforced by
// Supabase Auth server-side; this is a UX guard on top of that.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;
const ATTEMPTS_KEY = "apoyo_admin_login_attempts";
const LOCK_UNTIL_KEY = "apoyo_admin_login_lock_until";

const brandGradientText = {
  fontFamily: "'Instrument Sans', sans-serif",
  background: "var(--system-brand-gradient)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

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
    <SystemThemeScope className="flex min-h-screen flex-col bg-white">
      {/* Header / Logo Bar */}
      <div className="flex items-center gap-3 px-6 py-4 md:px-10 md:py-6">
        <BrandChrome variant="login-header" />
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-8 md:flex-row md:gap-20 md:px-10 md:py-0">
        {/* Left - Login Form */}
        <div className="w-full max-w-sm">
          <h2 className="mb-6 text-3xl font-bold md:text-4xl" style={brandGradientText}>
            Welcome to Apoyo
          </h2>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Email:</label>
              <input
                type="email"
                placeholder="Enter Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={controlsDisabled}
                autoComplete="email"
                className="w-full rounded-lg border border-ocean-500 px-4 py-3 text-sm outline-none placeholder-gray-400 focus:ring-2 focus:ring-ocean-500 disabled:cursor-not-allowed disabled:bg-gray-100"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Password:</label>
              <input
                type="password"
                placeholder="Enter Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={controlsDisabled}
                autoComplete="current-password"
                className="w-full rounded-lg border border-ocean-500 px-4 py-3 text-sm outline-none placeholder-gray-400 focus:ring-2 focus:ring-ocean-500 disabled:cursor-not-allowed disabled:bg-gray-100"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={controlsDisabled}
                  className="h-4 w-4 rounded border-gray-400"
                />
                Remember me
              </label>
              <a href="#" className="text-sm font-medium" style={brandGradientText}>
                Forgot Password
              </a>
            </div>

            <button
              type="submit"
              disabled={controlsDisabled}
              className="mt-2 w-full rounded-lg py-3 text-sm font-semibold text-white transition-all duration-300 hover:opacity-90 hover:scale-[1.02] hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
              style={{
                background: "var(--system-brand-gradient)",
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
              <p className="mt-1 text-sm text-amber-600">
                Too many failed attempts. Login is locked for {remainingSeconds}{" "}
                second{remainingSeconds === 1 ? "" : "s"}.
              </p>
            ) : (
              errorMessage && <p className="mt-1 text-sm text-red-500">{errorMessage}</p>
            )}
          </form>
        </div>

        {/* Right - Headphones + Tagline */}
        <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
          <div>
            <h1 className="text-2xl font-bold leading-tight md:text-3xl lg:text-4xl" style={brandGradientText}>
              Apoyo Command Center:
            </h1>
            <h1 className="text-2xl font-bold leading-tight md:text-3xl lg:text-4xl" style={brandGradientText}>
              Powering Public Service.
            </h1>
          </div>
          <img src={LOGIN_HERO_URL} alt="" className="h-auto w-52 sm:w-64 md:w-80" />
        </div>
      </div>

      {/* Footer */}
      <div
        className="mx-auto max-w-xl px-6 py-6 text-center text-xs font-medium sm:text-sm md:px-10 md:py-8"
        style={{
          fontFamily: "'Instrument Sans', sans-serif",
          color: "var(--system-primary)",
        }}
      >
        Welcome to the central administrative hub of Project Apoyo. Securely manage applications,
        oversee the distribution of essential services for the city of Dasmariñas.
      </div>
    </SystemThemeScope>
  );
}
