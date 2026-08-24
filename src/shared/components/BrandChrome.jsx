/**
 * Shared brand chrome for Admin / Super Admin sidebars and Login header.
 * Apoyo assets are hardcoded; Dasmariñas assets come from settings CMS
 * (hydrated via branding bootstrap + localStorage cache).
 */
import { APOYO_BANNER_URL, APOYO_LOGO_URL } from "../lib/staticAssets";
import { useLogoAndBanner } from "../hooks/useLogoAndBanner";

function BrandImage({ src, alt, className, priority = false }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
    />
  );
}

function LoginBrandSkeleton({ className = "" }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 ${className}`}
      aria-busy="true"
      aria-label="Loading branding"
    >
      <BrandImage
        src={APOYO_BANNER_URL}
        alt="Apoyo"
        priority
        className="h-[2.4rem] w-auto max-w-[12rem] object-contain md:h-[3rem] md:max-w-[16.8rem]"
      />
      <div className="mx-1 hidden h-8 w-px bg-slate-200 md:block md:h-10" aria-hidden />
      <div className="h-[2.5rem] w-44 animate-pulse rounded-md bg-slate-200/80 md:h-[3.125rem] md:w-56" />
    </div>
  );
}

/**
 * @param {"admin-nav" | "superadmin-nav" | "login-header"} variant
 */
export function BrandChrome({ variant, className = "" }) {
  const { assets, loading } = useLogoAndBanner();
  const apoyoLogo = APOYO_LOGO_URL;
  const apoyoBanner = APOYO_BANNER_URL;
  // Only skeleton when we have neither a cached nor a resolved Dasma asset yet.
  const waitingOnDasma = loading && !assets.dasmaLogo && !assets.dasmaBanner;

  if (variant === "login-header") {
    if (waitingOnDasma) {
      return <LoginBrandSkeleton className={className} />;
    }

    return (
      <div className={`flex flex-wrap items-center gap-3 ${className}`}>
        <BrandImage
          src={apoyoBanner}
          alt="Apoyo"
          priority
          className="h-[2.4rem] w-auto max-w-[12rem] object-contain md:h-[3rem] md:max-w-[16.8rem]"
        />
        {assets.dasmaLogo || assets.dasmaBanner ? (
          <div className="mx-1 hidden h-8 w-px bg-gray-300 md:block md:h-10" aria-hidden />
        ) : null}
        <BrandImage
          src={assets.dasmaLogo}
          alt="Dasmariñas Logo"
          className="h-[2.5rem] w-auto max-w-[10rem] object-contain md:h-[3.125rem] md:max-w-[12.5rem]"
        />
        <BrandImage
          src={assets.dasmaBanner}
          alt="Dasmariñas Banner"
          className="h-8 w-auto max-w-[12rem] object-contain md:h-[2.5rem] md:max-w-[16rem]"
        />
      </div>
    );
  }

  if (variant === "superadmin-nav") {
    return (
      <div className={`flex w-full flex-col items-center gap-3 ${className}`}>
        <div className="flex w-full items-center justify-center">
          <div className="flex items-center gap-3">
            <BrandImage
              src={apoyoLogo}
              alt="Apoyo logo"
              className="size-[4.125rem] shrink-0 object-contain"
            />
            {(waitingOnDasma || assets.dasmaLogo) && (
              <div className="h-8 w-px shrink-0 bg-white/25" aria-hidden />
            )}
            {waitingOnDasma ? (
              <div
                className="size-[4.125rem] shrink-0 animate-pulse rounded-md bg-white/10"
                aria-hidden
              />
            ) : (
              <BrandImage
                src={assets.dasmaLogo}
                alt="Dasmariñas logo"
                className="size-[4.125rem] shrink-0 object-contain"
              />
            )}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[15px] font-semibold tracking-tight text-white">Apoyo</div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ocean-200/90">
            Superadmin
          </div>
        </div>
      </div>
    );
  }

  // admin-nav
  return (
    <div className={`flex w-full flex-col items-center ${className}`}>
      <div className="flex w-full items-center justify-center">
        <div className="flex items-center gap-3">
          <BrandImage
            src={apoyoLogo}
            alt="Apoyo"
            className="size-[4.125rem] shrink-0 object-contain"
          />
          {(waitingOnDasma || assets.dasmaLogo) && (
            <div className="h-8 w-px shrink-0 bg-slate-200" aria-hidden />
          )}
          {waitingOnDasma ? (
            <div
              className="size-[4.125rem] shrink-0 animate-pulse rounded-md bg-slate-200/80"
              aria-hidden
            />
          ) : (
            <BrandImage
              src={assets.dasmaLogo}
              alt="Dasmariñas"
              className="size-[4.125rem] shrink-0 object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
