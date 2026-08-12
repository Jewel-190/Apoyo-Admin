/**
 * Shared brand chrome for Admin / Super Admin sidebars and Login header.
 */
import { useLogoAndBanner } from "../hooks/useLogoAndBanner";

function BrandImage({ src, alt, className }) {
  if (!src) return null;
  return <img src={src} alt={alt} className={className} />;
}

/**
 * @param {"admin-nav" | "superadmin-nav" | "login-header"} variant
 * @param {{ apoyoLogo?: string, apoyoBanner?: string, dasmaLogo?: string, dasmaBanner?: string }} [fallbacks]
 */
export function BrandChrome({ variant, fallbacks = {}, className = "" }) {
  const { assets } = useLogoAndBanner(fallbacks);

  if (variant === "login-header") {
    const primary = assets.apoyoBanner || assets.apoyoLogo;
    return (
      <div className={`flex flex-wrap items-center gap-3 ${className}`}>
        <BrandImage
          src={primary}
          alt="Apoyo"
          className="h-8 w-auto max-w-[10rem] object-contain md:h-10 md:max-w-[14rem]"
        />
        {(assets.dasmaLogo || assets.dasmaBanner) && primary ? (
          <div className="mx-1 hidden h-8 w-px bg-gray-300 md:block md:h-10" aria-hidden />
        ) : null}
        <BrandImage
          src={assets.dasmaLogo}
          alt="Dasmarinas Logo"
          className="h-8 w-auto max-w-[8rem] object-contain md:h-10 md:max-w-[10rem]"
        />
        <BrandImage
          src={assets.dasmaBanner}
          alt="Dasmarinas Banner"
          className="h-8 w-auto max-w-[12rem] object-contain md:h-10 md:max-w-[16rem]"
        />
      </div>
    );
  }

  if (variant === "superadmin-nav") {
    return (
      <div className={`flex w-full flex-col items-center gap-3 ${className}`}>
        <div className="flex w-full items-center justify-center gap-2.5">
          {assets.apoyoLogo ? (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 p-1.5 backdrop-blur-sm">
              <BrandImage
                src={assets.apoyoLogo}
                alt="Apoyo logo"
                className="size-full object-contain"
              />
            </div>
          ) : null}
          {assets.dasmaLogo ? (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 p-1.5 backdrop-blur-sm">
              <BrandImage
                src={assets.dasmaLogo}
                alt="Dasmarinas logo"
                className="size-full object-contain"
              />
            </div>
          ) : null}
        </div>
        {assets.dasmaBanner ? (
          <BrandImage
            src={assets.dasmaBanner}
            alt="Dasmarinas banner"
            className="h-9 w-full max-w-[11rem] object-contain object-center"
          />
        ) : null}
        <div className="text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ocean-200/90">
            Superadmin
          </div>
          <div className="mt-0.5 text-[15px] font-semibold tracking-tight text-white">Apoyo</div>
        </div>
      </div>
    );
  }

  // admin-nav
  return (
    <div className={`flex w-full flex-col items-center gap-2.5 px-1 ${className}`}>
      <div className="flex w-full items-center justify-center gap-2">
        <BrandImage
          src={assets.apoyoLogo}
          alt="Apoyo"
          className="block h-9 max-h-9 w-auto max-w-[45%] object-contain object-center"
        />
        <BrandImage
          src={assets.dasmaLogo}
          alt="Dasmarinas"
          className="block h-9 max-h-9 w-auto max-w-[45%] object-contain object-center"
        />
      </div>
      {assets.dasmaBanner ? (
        <BrandImage
          src={assets.dasmaBanner}
          alt="Dasmarinas banner"
          className="block h-8 max-h-8 w-full max-w-full object-contain object-center"
        />
      ) : null}
    </div>
  );
}
