import type { User as UserAuth } from "next-auth";
import { signOut, useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import React, { Fragment, useEffect, useState, useRef } from "react";
import { Toaster } from "react-hot-toast";

import dayjs from "@calcom/dayjs";
import { useIsEmbed } from "@calcom/embed-core/embed-iframe";
import UnconfirmedBookingBadge from "@calcom/features/bookings/UnconfirmedBookingBadge";
import ImpersonatingBanner from "@calcom/features/ee/impersonation/components/ImpersonatingBanner";
import { OrgUpgradeBanner } from "@calcom/features/ee/organizations/components/OrgUpgradeBanner";
import { useOrgBrandingValues } from "@calcom/features/ee/organizations/hooks";
import HelpMenuItem from "@calcom/features/ee/support/components/HelpMenuItem";
import { TeamsUpgradeBanner } from "@calcom/features/ee/teams/components";
import { useFlagMap } from "@calcom/features/flags/context/provider";
import { KBarContent, KBarRoot, KBarTrigger } from "@calcom/features/kbar/Kbar";
import TimezoneChangeDialog from "@calcom/features/settings/TimezoneChangeDialog";
import AdminPasswordBanner from "@calcom/features/users/components/AdminPasswordBanner";
import VerifyEmailBanner from "@calcom/features/users/components/VerifyEmailBanner";
import classNames from "@calcom/lib/classNames";
import { APP_NAME, DESKTOP_APP_LINK, JOIN_SLACK, ROADMAP, WEBAPP_URL } from "@calcom/lib/constants";
import getBrandColours from "@calcom/lib/getBrandColours";
import { useIsomorphicLayoutEffect } from "@calcom/lib/hooks/useIsomorphicLayoutEffect";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { isKeyInObject } from "@calcom/lib/isKeyInObject";
import type { User } from "@calcom/prisma/client";
import { trpc } from "@calcom/trpc/react";
import useAvatarQuery from "@calcom/trpc/react/hooks/useAvatarQuery";
import useEmailVerifyCheck from "@calcom/trpc/react/hooks/useEmailVerifyCheck";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import type { SVGComponent } from "@calcom/types/SVGComponent";
import {
  Avatar,
  Button,
  Credits,
  Dropdown,
  DropdownItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ErrorBoundary,
  HeadSeo,
  Logo,
  SkeletonText,
  Tooltip,
  showToast,
  useCalcomTheme,
  ButtonOrLink,
} from "@calcom/ui";
import {
  ArrowLeft,
  ArrowRight,
  BarChart,
  Calendar,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Grid,
  HelpCircle,
  Link as LinkIcon,
  LogOut,
  Map,
  Moon,
  MoreHorizontal,
  ChevronDown,
  Copy,
  Settings,
  Slack,
  Users,
  Zap,
  User as UserIcon,
} from "@calcom/ui/components/icon";

import FreshChatProvider from "../ee/support/lib/freshchat/FreshChatProvider";
import { TeamInviteBadge } from "./TeamInviteBadge";

// need to import without ssr to prevent hydration errors
const Tips = dynamic(() => import("@calcom/features/tips").then((mod) => mod.Tips), {
  ssr: false,
});

/* TODO: Migate this */

export const ONBOARDING_INTRODUCED_AT = dayjs("September 1 2021").toISOString();

export const ONBOARDING_NEXT_REDIRECT = {
  redirect: {
    permanent: false,
    destination: "/getting-started",
  },
} as const;

export const shouldShowOnboarding = (
  user: Pick<User, "createdDate" | "completedOnboarding" | "organizationId">
) => {
  return (
    !user.completedOnboarding &&
    !user.organizationId &&
    dayjs(user.createdDate).isAfter(ONBOARDING_INTRODUCED_AT)
  );
};

function useRedirectToLoginIfUnauthenticated(isPublic = false) {
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const router = useRouter();

  useEffect(() => {
    if (isPublic) {
      return;
    }

    if (!loading && !session) {
      router.replace({
        pathname: "/auth/login",
        query: {
          callbackUrl: `${WEBAPP_URL}${location.pathname}${location.search}`,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, isPublic]);

  return {
    loading: loading && !session,
    session,
  };
}

function useRedirectToOnboardingIfNeeded() {
  const router = useRouter();
  const query = useMeQuery();
  const user = query.data;
  const flags = useFlagMap();

  const { data: email } = useEmailVerifyCheck();

  const needsEmailVerification = !email?.isVerified && flags["email-verification"];

  const isRedirectingToOnboarding = user && shouldShowOnboarding(user);

  useEffect(() => {
    if (isRedirectingToOnboarding && !needsEmailVerification) {
      router.replace({
        pathname: "/getting-started",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRedirectingToOnboarding, needsEmailVerification]);

  return {
    isRedirectingToOnboarding,
  };
}

const Layout = (props: LayoutProps) => {
  const pageTitle = typeof props.heading === "string" && !props.title ? props.heading : props.title;
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const [bannersHeight, setBannersHeight] = useState<number>(0);

  useIsomorphicLayoutEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const { offsetHeight } = entries[0].target as HTMLElement;
      setBannersHeight(offsetHeight);
    });

    const currentBannerRef = bannerRef.current;

    if (currentBannerRef) {
      resizeObserver.observe(currentBannerRef);
    }

    return () => {
      if (currentBannerRef) {
        resizeObserver.unobserve(currentBannerRef);
      }
    };
  }, [bannerRef]);

  return (
    <>
      {!props.withoutSeo && (
        <HeadSeo
          title={pageTitle ?? APP_NAME}
          description={props.subtitle ? props.subtitle?.toString() : ""}
        />
      )}
      <div>
        <Toaster position="bottom-right" />
      </div>

      {/* todo: only run this if timezone is different */}
      <TimezoneChangeDialog />
      <div style={{ paddingTop: `${bannersHeight}px` }} className="flex min-h-screen flex-col">
        <div ref={bannerRef} className="fixed top-0 z-10 w-full divide-y divide-black">
          <TeamsUpgradeBanner />
          <OrgUpgradeBanner />
          <ImpersonatingBanner />
          <AdminPasswordBanner />
          <VerifyEmailBanner />
        </div>
        <div className="flex flex-1" data-testid="dashboard-shell">
          {props.SidebarContainer || <SideBarContainer bannersHeight={bannersHeight} />}
          <div className="flex w-0 flex-1 flex-col">
            <MainContainer {...props} />
          </div>
        </div>
      </div>
    </>
  );
};

type DrawerState = [isOpen: boolean, setDrawerOpen: Dispatch<SetStateAction<boolean>>];

type LayoutProps = {
  centered?: boolean;
  title?: string;
  heading?: ReactNode;
  subtitle?: ReactNode;
  headerClassName?: string;
  children: ReactNode;
  CTA?: ReactNode;
  large?: boolean;
  MobileNavigationContainer?: ReactNode;
  SidebarContainer?: ReactNode;
  TopNavContainer?: ReactNode;
  drawerState?: DrawerState;
  HeadingLeftIcon?: ReactNode;
  backPath?: string | boolean; // renders back button to specified path
  // use when content needs to expand with flex
  flexChildrenContainer?: boolean;
  isPublic?: boolean;
  withoutMain?: boolean;
  // Gives you the option to skip HeadSEO and render your own.
  withoutSeo?: boolean;
  // Gives the ability to include actions to the right of the heading
  actions?: JSX.Element;
  beforeCTAactions?: JSX.Element;
  afterHeading?: ReactNode;
  smallHeading?: boolean;
  hideHeadingOnMobile?: boolean;
};

const useBrandColors = () => {
  const { data: user } = useMeQuery();
  const brandTheme = getBrandColours({
    lightVal: user?.brandColor,
    darkVal: user?.darkBrandColor,
  });
  useCalcomTheme(brandTheme);
};

const KBarWrapper = ({ children, withKBar = false }: { withKBar: boolean; children: React.ReactNode }) =>
  withKBar ? (
    <KBarRoot>
      {children}
      <KBarContent />
    </KBarRoot>
  ) : (
    <>{children}</>
  );

const PublicShell = (props: LayoutProps) => {
  const { status } = useSession();
  return (
    <KBarWrapper withKBar={status === "authenticated"}>
      <Layout {...props} />
    </KBarWrapper>
  );
};

export default function Shell(props: LayoutProps) {
  // if a page is unauthed and isPublic is true, the redirect does not happen.
  useRedirectToLoginIfUnauthenticated(props.isPublic);
  useRedirectToOnboardingIfNeeded();
  // System Theme is automatically supported using ThemeProvider. If we intend to use user theme throughout the app we need to uncomment this.
  // useTheme(profile.theme);
  useBrandColors();

  return !props.isPublic ? (
    <KBarWrapper withKBar>
      <Layout {...props} />
    </KBarWrapper>
  ) : (
    <PublicShell {...props} />
  );
}

interface UserDropdownProps {
  small?: boolean;
}

function UserDropdown({ small }: UserDropdownProps) {
  const { t } = useLocale();
  const { data: user } = useMeQuery();
  const { data: avatar } = useAvatarQuery();
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    const Beacon = window.Beacon;
    // window.Beacon is defined when user actually opens up HelpScout and username is available here. On every re-render update session info, so that it is always latest.
    Beacon &&
      Beacon("session-data", {
        username: user?.username || "Unknown",
        screenResolution: `${screen.width}x${screen.height}`,
      });
  });
  const mutation = trpc.viewer.away.useMutation({
    onSettled() {
      utils.viewer.me.invalidate();
    },
  });
  const utils = trpc.useContext();
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  if (!user) {
    return null;
  }
  const onHelpItemSelect = () => {
    setHelpOpen(false);
    setMenuOpen(false);
  };

  // Prevent rendering dropdown if user isn't available.
  // We don't want to show nameless user.
  if (!user) {
    return null;
  }
  return (
    <Dropdown open={menuOpen}>
      <div className="ltr:sm:-ml-5 rtl:sm:-mr-5">
        <DropdownMenuTrigger asChild onClick={() => setMenuOpen((menuOpen) => !menuOpen)}>
          <button
            className={classNames(
              "hover:bg-emphasis group mx-0 ml-7 flex cursor-pointer appearance-none items-center rounded-full text-left outline-none focus:outline-none focus:ring-0 md:rounded-none lg:rounded",
              small ? "p-2" : "px-2 py-1"
            )}>
            <span
              className={classNames(
                small ? "h-4 w-4" : "h-6 w-6 ltr:mr-2 rtl:ml-2",
                "relative flex-shrink-0 rounded-full bg-gray-300 "
              )}>
              <Avatar
                size={small ? "xs" : "sm"}
                imageSrc={avatar?.avatar || WEBAPP_URL + "/" + user.username + "/avatar.png"}
                alt={user.username || "Nameless User"}
              />
              <span
                className={classNames(
                  "border-muted absolute -bottom-1 -right-1  rounded-full border-2 bg-green-500",
                  user.away ? "bg-yellow-500" : "bg-green-500",
                  small ? "-bottom-0.5 -right-0.5 h-2.5 w-2.5" : "bottom-0 right-0 h-3 w-3"
                )}
              />
            </span>
            {!small && (
              <span className="flex flex-grow items-center">
                <span className="line-clamp-1 flex-grow text-sm leading-none">
                  <span className="text-emphasis block font-medium">{user.name || "Nameless User"}</span>
                </span>
                <ChevronDown
                  className="group-hover:text-subtle text-muted h-4 w-4 flex-shrink-0 rtl:mr-4"
                  aria-hidden="true"
                />
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
      </div>

      <DropdownMenuPortal>
        <FreshChatProvider>
          <DropdownMenuContent
            align="start"
            onInteractOutside={() => {
              setMenuOpen(false);
              setHelpOpen(false);
            }}
            className="group overflow-hidden rounded-md">
            {helpOpen ? (
              <HelpMenuItem onHelpItemSelect={() => onHelpItemSelect()} />
            ) : (
              <>
                <DropdownMenuItem>
                  <DropdownItem
                    type="button"
                    StartIcon={(props) => (
                      <UserIcon className={classNames("text-default", props.className)} aria-hidden="true" />
                    )}
                    href="/settings/my-account/profile">
                    {t("my_profile")}
                  </DropdownItem>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <DropdownItem
                    type="button"
                    StartIcon={(props) => (
                      <Settings className={classNames("text-default", props.className)} aria-hidden="true" />
                    )}
                    href="/settings/my-account/general">
                    {t("my_settings")}
                  </DropdownItem>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <DropdownItem
                    type="button"
                    StartIcon={(props) => (
                      <Moon className={classNames("text-default", props.className)} aria-hidden="true" />
                    )}
                    onClick={() => {
                      mutation.mutate({ away: !user?.away });
                      utils.viewer.me.invalidate();
                    }}>
                    {user.away ? t("set_as_free") : t("set_as_away")}
                  </DropdownItem>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <DropdownItem
                    StartIcon={(props) => <Slack strokeWidth={1.5} {...props} />}
                    target="_blank"
                    rel="noreferrer"
                    href={JOIN_SLACK}>
                    {t("join_our_slack")}
                  </DropdownItem>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <DropdownItem StartIcon={Map} target="_blank" href={ROADMAP}>
                    {t("visit_roadmap")}
                  </DropdownItem>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <DropdownItem
                    type="button"
                    StartIcon={(props) => <HelpCircle aria-hidden="true" {...props} />}
                    onClick={() => setHelpOpen(true)}>
                    {t("help")}
                  </DropdownItem>
                </DropdownMenuItem>
                <DropdownMenuItem className="desktop-hidden hidden lg:flex">
                  <DropdownItem StartIcon={Download} target="_blank" rel="noreferrer" href={DESKTOP_APP_LINK}>
                    {t("download_desktop_app")}
                  </DropdownItem>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem>
                  <DropdownItem
                    type="button"
                    StartIcon={(props) => <LogOut aria-hidden="true" {...props} />}
                    onClick={() => signOut({ callbackUrl: "/auth/logout" })}>
                    {t("sign_out")}
                  </DropdownItem>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </FreshChatProvider>
      </DropdownMenuPortal>
    </Dropdown>
  );
}

export type NavigationItemType = {
  name: string;
  href: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
  target?: HTMLAnchorElement["target"];
  badge?: React.ReactNode;
  icon?: SVGComponent;
  child?: NavigationItemType[];
  pro?: true;
  onlyMobile?: boolean;
  onlyDesktop?: boolean;
  isCurrent?: ({
    item,
    isChild,
    router,
  }: {
    item: Pick<NavigationItemType, "href">;
    isChild?: boolean;
    router: NextRouter;
  }) => boolean;
};

const requiredCredentialNavigationItems = ["Routing Forms"];
const MORE_SEPARATOR_NAME = "more";

const navigation: NavigationItemType[] = [
  {
    name: "event_types_page_title",
    href: "/event-types",
    icon: LinkIcon,
  },
  {
    name: "bookings",
    href: "/bookings/upcoming",
    icon: Calendar,
    badge: <UnconfirmedBookingBadge />,
    isCurrent: ({ router }) => {
      const path = router.asPath.split("?")[0];
      return path.startsWith("/bookings");
    },
  },
  {
    name: "availability",
    href: "/availability",
    icon: Clock,
  },
  {
    name: "teams",
    href: "/teams",
    icon: Users,
    onlyDesktop: true,
    badge: <TeamInviteBadge />,
  },
  {
    name: "apps",
    href: "/apps",
    icon: Grid,
    isCurrent: ({ router, item }) => {
      const path = router.asPath.split("?")[0];
      // During Server rendering path is /v2/apps but on client it becomes /apps(weird..)
      return (
        (path.startsWith(item.href) || path.startsWith("/v2" + item.href)) && !path.includes("routing-forms/")
      );
    },
    child: [
      {
        name: "app_store",
        href: "/apps",
        isCurrent: ({ router, item }) => {
          const path = router.asPath.split("?")[0];
          // During Server rendering path is /v2/apps but on client it becomes /apps(weird..)
          return (
            (path.startsWith(item.href) || path.startsWith("/v2" + item.href)) &&
            !path.includes("routing-forms/") &&
            !path.includes("/installed")
          );
        },
      },
      {
        name: "installed_apps",
        href: "/apps/installed/calendar",
        isCurrent: ({ router }) => {
          const path = router.asPath;
          return path.startsWith("/apps/installed/") || path.startsWith("/v2/apps/installed/");
        },
      },
    ],
  },
  {
    name: MORE_SEPARATOR_NAME,
    href: "/more",
    icon: MoreHorizontal,
  },
  {
    name: "Routing Forms",
    href: "/apps/routing-forms/forms",
    icon: FileText,
    isCurrent: ({ router }) => {
      return router.asPath.startsWith("/apps/routing-forms/");
    },
  },
  {
    name: "workflows",
    href: "/workflows",
    icon: Zap,
  },
  {
    name: "insights",
    href: "/insights",
    icon: BarChart,
  },
];

const moreSeparatorIndex = navigation.findIndex((item) => item.name === MORE_SEPARATOR_NAME);
// We create all needed navigation items for the different use cases
const { desktopNavigationItems, mobileNavigationBottomItems, mobileNavigationMoreItems } = navigation.reduce<
  Record<string, NavigationItemType[]>
>(
  (items, item, index) => {
    // We filter out the "more" separator in` desktop navigation
    if (item.name !== MORE_SEPARATOR_NAME) items.desktopNavigationItems.push(item);
    // Items for mobile bottom navigation
    if (index < moreSeparatorIndex + 1 && !item.onlyDesktop) {
      items.mobileNavigationBottomItems.push(item);
    } // Items for the "more" menu in mobile navigation
    else {
      items.mobileNavigationMoreItems.push(item);
    }
    return items;
  },
  { desktopNavigationItems: [], mobileNavigationBottomItems: [], mobileNavigationMoreItems: [] }
);

const Navigation = () => {
  return (
    <nav className="mt-2 flex-1 md:px-2 lg:mt-6 lg:px-0">
      {desktopNavigationItems.map((item) => (
        <NavigationItem key={item.name} item={item} />
      ))}
      <div className="text-subtle mt-0.5 lg:hidden">
        <KBarTrigger />
      </div>
    </nav>
  );
};

function useShouldDisplayNavigationItem(item: NavigationItemType) {
  const { status } = useSession();
  const { data: routingForms } = trpc.viewer.appById.useQuery(
    { appId: "routing-forms" },
    {
      enabled: status === "authenticated" && requiredCredentialNavigationItems.includes(item.name),
      trpc: {},
    }
  );
  const flags = useFlagMap();
  if (isKeyInObject(item.name, flags)) return flags[item.name];
  return !requiredCredentialNavigationItems.includes(item.name) || routingForms?.isInstalled;
}

const defaultIsCurrent: NavigationItemType["isCurrent"] = ({ isChild, item, router }) => {
  return isChild ? item.href === router.asPath : item.href ? router.asPath.startsWith(item.href) : false;
};

const NavigationItem: React.FC<{
  index?: number;
  item: NavigationItemType;
  isChild?: boolean;
}> = (props) => {
  const { item, isChild } = props;
  const { t, isLocaleReady } = useLocale();
  const router = useRouter();
  const isCurrent: NavigationItemType["isCurrent"] = item.isCurrent || defaultIsCurrent;
  const current = isCurrent({ isChild: !!isChild, item, router });
  const shouldDisplayNavigationItem = useShouldDisplayNavigationItem(props.item);

  if (!shouldDisplayNavigationItem) return null;

  return (
    <Fragment>
      <Tooltip side="right" content={t(item.name)} className="lg:hidden">
        <Link
          href={item.href}
          aria-label={t(item.name)}
          className={classNames(
            "[&[aria-current='page']]:bg-emphasis  text-default group flex items-center rounded-md py-2 px-3 text-sm font-medium",
            isChild
              ? `[&[aria-current='page']]:text-emphasis hidden h-8 pl-16 lg:flex lg:pl-11 [&[aria-current='page']]:bg-transparent ${
                  props.index === 0 ? "mt-0" : "mt-px"
                }`
              : "[&[aria-current='page']]:text-emphasis mt-0.5 text-sm",
            isLocaleReady ? "hover:bg-emphasis hover:text-emphasis" : ""
          )}
          aria-current={current ? "page" : undefined}>
          {item.icon && (
            <item.icon
              className="mr-2 h-4 w-4 flex-shrink-0 ltr:mr-2 rtl:ml-2 [&[aria-current='page']]:text-inherit"
              aria-hidden="true"
              aria-current={current ? "page" : undefined}
            />
          )}
          {isLocaleReady ? (
            <span className="hidden w-full justify-between lg:flex">
              <div className="flex">{t(item.name)}</div>
              {item.badge && item.badge}
            </span>
          ) : (
            <SkeletonText style={{ width: `${item.name.length * 10}px` }} className="h-[20px]" />
          )}
        </Link>
      </Tooltip>
      {item.child &&
        isCurrent({ router, isChild, item }) &&
        item.child.map((item, index) => <NavigationItem index={index} key={item.name} item={item} isChild />)}
    </Fragment>
  );
};

function MobileNavigationContainer() {
  const { status } = useSession();
  if (status !== "authenticated") return null;
  return <MobileNavigation />;
}

const MobileNavigation = () => {
  const isEmbed = useIsEmbed();

  return (
    <>
      <nav
        className={classNames(
          "pwa:pb-2.5 bg-muted border-subtle fixed bottom-0 z-30 -mx-4 flex w-full border-t bg-opacity-40 px-1 shadow backdrop-blur-md md:hidden",
          isEmbed && "hidden"
        )}>
        {mobileNavigationBottomItems.map((item) => (
          <MobileNavigationItem key={item.name} item={item} />
        ))}
      </nav>
      {/* add padding to content for mobile navigation*/}
      <div className="block pt-12 md:hidden" />
    </>
  );
};

const MobileNavigationItem: React.FC<{
  item: NavigationItemType;
  isChild?: boolean;
}> = (props) => {
  const { item, isChild } = props;
  const router = useRouter();
  const { t, isLocaleReady } = useLocale();
  const isCurrent: NavigationItemType["isCurrent"] = item.isCurrent || defaultIsCurrent;
  const current = isCurrent({ isChild: !!isChild, item, router });
  const shouldDisplayNavigationItem = useShouldDisplayNavigationItem(props.item);

  if (!shouldDisplayNavigationItem) return null;
  return (
    <Link
      key={item.name}
      href={item.href}
      className="[&[aria-current='page']]:text-emphasis hover:text-default text-muted relative my-2 min-w-0 flex-1 overflow-hidden rounded-md !bg-transparent p-1 text-center text-xs font-medium focus:z-10 sm:text-sm"
      aria-current={current ? "page" : undefined}>
      {item.badge && <div className="absolute right-1 top-1">{item.badge}</div>}
      {item.icon && (
        <item.icon
          className="[&[aria-current='page']]:text-emphasis  mx-auto mb-1 block h-5 w-5 flex-shrink-0 text-center text-inherit"
          aria-hidden="true"
          aria-current={current ? "page" : undefined}
        />
      )}
      {isLocaleReady ? <span className="block truncate">{t(item.name)}</span> : <SkeletonText />}
    </Link>
  );
};

const MobileNavigationMoreItem: React.FC<{
  item: NavigationItemType;
  isChild?: boolean;
}> = (props) => {
  const { item } = props;
  const { t, isLocaleReady } = useLocale();
  const shouldDisplayNavigationItem = useShouldDisplayNavigationItem(props.item);

  if (!shouldDisplayNavigationItem) return null;

  return (
    <li className="border-subtle border-b last:border-b-0" key={item.name}>
      <Link href={item.href} className="hover:bg-subtle flex items-center justify-between p-5">
        <span className="text-default flex items-center font-semibold ">
          {item.icon && <item.icon className="h-5 w-5 flex-shrink-0 ltr:mr-3 rtl:ml-3" aria-hidden="true" />}
          {isLocaleReady ? t(item.name) : <SkeletonText />}
        </span>
        <ArrowRight className="text-subtle h-5 w-5" />
      </Link>
    </li>
  );
};

type SideBarContainerProps = {
  bannersHeight: number;
};

type SideBarProps = {
  bannersHeight: number;
  user?: UserAuth | null;
};

function SideBarContainer({ bannersHeight }: SideBarContainerProps) {
  const { status, data } = useSession();
  const router = useRouter();

  // Make sure that Sidebar is rendered optimistically so that a refresh of pages when logged in have SideBar from the beginning.
  // This improves the experience of refresh on app store pages(when logged in) which are SSG.
  // Though when logged out, app store pages would temporarily show SideBar until session status is confirmed.
  if (status !== "loading" && status !== "authenticated") return null;
  if (router.route.startsWith("/v2/settings/")) return null;
  return <SideBar bannersHeight={bannersHeight} user={data?.user} />;
}

const getOrganizationUrl = (slug: string) =>
  `${slug}.${process.env.NEXT_PUBLIC_WEBSITE_URL?.replace?.(/http(s*):\/\//, "")}`;

function SideBar({ bannersHeight, user }: SideBarProps) {
  const { t, isLocaleReady } = useLocale();
  const router = useRouter();
  const orgBranding = useOrgBrandingValues();
  const publicPageUrl = orgBranding?.slug ? getOrganizationUrl(orgBranding?.slug) : "";
  const bottomNavItems: NavigationItemType[] = [
    ...(user?.username
      ? [
          {
            name: "view_public_page",
            href: !!user?.organizationId
              ? publicPageUrl
              : `${process.env.NEXT_PUBLIC_WEBSITE_URL}/${user.username}`,
            icon: ExternalLink,
            target: "__blank",
          },
          {
            name: "copy_public_page_link",
            href: "",
            onClick: (e: { preventDefault: () => void }) => {
              e.preventDefault();
              navigator.clipboard.writeText(
                !!user?.organizationId
                  ? publicPageUrl
                  : `${process.env.NEXT_PUBLIC_WEBSITE_URL}/${user.username}`
              );
              showToast(t("link_copied"), "success");
            },
            icon: Copy,
          },
        ]
      : []),
    {
      name: "settings",
      href: user?.organizationId
        ? `/settings/teams/${user.organizationId}/profile`
        : "/settings/my-account/profile",
      icon: Settings,
    },
  ];
  return (
    <div className="relative">
      <aside
        style={{ maxHeight: `calc(100vh - ${bannersHeight}px)`, top: `${bannersHeight}px` }}
        className="desktop-transparent bg-muted border-muted fixed left-0 hidden h-full max-h-screen w-14 flex-col overflow-y-auto overflow-x-hidden border-r dark:bg-gradient-to-tr dark:from-[#2a2a2a] dark:to-[#1c1c1c] md:sticky md:flex lg:w-56 lg:px-3">
        <div className="flex h-full flex-col justify-between py-3 lg:pt-6 ">
          <header className="items-center justify-between md:hidden lg:flex">
            {orgBranding ? (
              <Link href="/event-types" className="px-2">
                {orgBranding ? (
                  <div className="flex items-center gap-2 font-medium">
                    {orgBranding.logo && <Avatar alt="" imageSrc={orgBranding.logo} size="sm" />}
                    <p className="text line-clamp-1 text-sm">
                      <span>{orgBranding.name}</span>
                    </p>
                  </div>
                ) : (
                  <Logo small />
                )}
              </Link>
            ) : (
              <div data-testid="user-dropdown-trigger">
                <span className="hidden lg:inline">
                  <UserDropdown />
                </span>
                <span className="hidden md:inline lg:hidden">
                  <UserDropdown small />
                </span>
              </div>
            )}
            <div className="flex space-x-1 rtl:space-x-reverse">
              <button
                color="minimal"
                onClick={() => window.history.back()}
                className="desktop-only hover:text-emphasis text-subtle group flex text-sm font-medium">
                <ArrowLeft className="group-hover:text-emphasis text-subtle h-4 w-4 flex-shrink-0" />
              </button>
              <button
                color="minimal"
                onClick={() => window.history.forward()}
                className="desktop-only hover:text-emphasis text-subtle group flex text-sm font-medium">
                <ArrowRight className="group-hover:text-emphasis text-subtle h-4 w-4 flex-shrink-0" />
              </button>
              {!!orgBranding && (
                <div data-testid="user-dropdown-trigger" className="flex items-center">
                  <UserDropdown small />
                </div>
              )}
              <KBarTrigger />
            </div>
          </header>

          <hr className="desktop-only border-subtle absolute -left-3 -right-3 mt-4 block w-full" />

          {/* logo icon for tablet */}
          <Link href="/event-types" className="text-center md:inline lg:hidden">
            <Logo small icon />
          </Link>

          <Navigation />
        </div>

        <div>
          <Tips />
          {bottomNavItems.map(({ icon: Icon, ...item }) => (
            <Tooltip side="right" content={t(item.name)} className="lg:hidden" key={item.name}>
              <ButtonOrLink
                href={item.href || undefined}
                aria-label={t(item.name)}
                target={item.target}
                className={classNames(
                  "text-left",
                  "[&[aria-current='page']]:bg-emphasis  text-default group flex items-center rounded-md py-2 px-3 text-sm font-medium",
                  "[&[aria-current='page']]:text-emphasis mt-0.5 text-sm",
                  isLocaleReady ? "hover:bg-emphasis hover:text-emphasis" : ""
                )}
                aria-current={
                  defaultIsCurrent && defaultIsCurrent({ item: { href: item.href }, router })
                    ? "page"
                    : undefined
                }
                onClick={item.onClick}>
                {!!Icon && (
                  <Icon
                    className="mr-2 h-4 w-4 flex-shrink-0 ltr:mr-2 rtl:ml-2 [&[aria-current='page']]:text-inherit"
                    aria-hidden="true"
                    aria-current={
                      defaultIsCurrent && defaultIsCurrent({ item: { href: item.href }, router })
                        ? "page"
                        : undefined
                    }
                  />
                )}
                {isLocaleReady ? (
                  <span className="hidden w-full justify-between lg:flex">
                    <div className="flex">{t(item.name)}</div>
                  </span>
                ) : (
                  <SkeletonText style={{ width: `${item.name.length * 10}px` }} className="h-[20px]" />
                )}
              </ButtonOrLink>
            </Tooltip>
          ))}
          <Credits />
        </div>
      </aside>
    </div>
  );
}

export function ShellMain(props: LayoutProps) {
  const router = useRouter();
  const { isLocaleReady } = useLocale();

  return (
    <>
      <div
        className={classNames(
          "flex items-center md:mb-6 md:mt-0",
          props.smallHeading ? "lg:mb-7" : "lg:mb-8",
          props.hideHeadingOnMobile ? "mb-0" : "mb-6"
        )}>
        {!!props.backPath && (
          <Button
            variant="icon"
            size="sm"
            color="minimal"
            onClick={() =>
              typeof props.backPath === "string" ? router.push(props.backPath as string) : router.back()
            }
            StartIcon={ArrowLeft}
            aria-label="Go Back"
            className="rounded-md ltr:mr-2 rtl:ml-2"
          />
        )}
        {props.heading && (
          <header
            className={classNames(props.large && "py-8", "flex w-full max-w-full items-center truncate")}>
            {props.HeadingLeftIcon && <div className="ltr:mr-4">{props.HeadingLeftIcon}</div>}
            <div className={classNames("w-full truncate ltr:mr-4 rtl:ml-4 md:block", props.headerClassName)}>
              {props.heading && (
                <h3
                  className={classNames(
                    "font-cal max-w-28 sm:max-w-72 md:max-w-80 text-emphasis inline truncate text-lg font-semibold tracking-wide sm:text-xl md:block xl:max-w-full",
                    props.smallHeading ? "text-base" : "text-xl",
                    props.hideHeadingOnMobile && "hidden"
                  )}>
                  {!isLocaleReady ? <SkeletonText invisible /> : props.heading}
                </h3>
              )}
              {props.subtitle && (
                <p className="text-default hidden text-sm md:block">
                  {!isLocaleReady ? <SkeletonText invisible /> : props.subtitle}
                </p>
              )}
            </div>
            {props.beforeCTAactions}
            {props.CTA && (
              <div
                className={classNames(
                  props.backPath
                    ? "relative"
                    : "pwa:bottom-24 fixed bottom-20 z-40 ltr:right-4 rtl:left-4 md:z-auto md:ltr:right-0 md:rtl:left-0",
                  "flex-shrink-0 md:relative md:bottom-auto md:right-auto"
                )}>
                {props.CTA}
              </div>
            )}
            {props.actions && props.actions}
          </header>
        )}
      </div>
      {props.afterHeading && <>{props.afterHeading}</>}
      <div className={classNames(props.flexChildrenContainer && "flex flex-1 flex-col")}>
        {props.children}
      </div>
    </>
  );
}

function MainContainer({
  MobileNavigationContainer: MobileNavigationContainerProp = <MobileNavigationContainer />,
  TopNavContainer: TopNavContainerProp = <TopNavContainer />,
  ...props
}: LayoutProps) {
  return (
    <main className="bg-default relative z-0 flex-1 focus:outline-none">
      {/* show top navigation for md and smaller (tablet and phones) */}
      {TopNavContainerProp}
      <div className="max-w-full py-4 px-4 md:py-8 lg:px-12">
        <ErrorBoundary>
          {!props.withoutMain ? <ShellMain {...props}>{props.children}</ShellMain> : props.children}
        </ErrorBoundary>
        {/* show bottom navigation for md and smaller (tablet and phones) on pages where back button doesn't exist */}
        {!props.backPath ? MobileNavigationContainerProp : null}
      </div>
    </main>
  );
}

function TopNavContainer() {
  const { status } = useSession();
  if (status !== "authenticated") return null;
  return <TopNav />;
}

function TopNav() {
  const isEmbed = useIsEmbed();
  const { t } = useLocale();
  return (
    <>
      <nav
        style={isEmbed ? { display: "none" } : {}}
        className="bg-muted border-subtle sticky top-0 z-40 flex w-full items-center justify-between border-b bg-opacity-50 py-1.5 px-4 backdrop-blur-lg sm:p-4 md:hidden">
        <Link href="/event-types">
          <Logo />
        </Link>
        <div className="flex items-center gap-2 self-center">
          <span className="hover:bg-muted hover:text-emphasis text-default group flex items-center rounded-full text-sm font-medium lg:hidden">
            <KBarTrigger />
          </span>
          <button className="hover:bg-muted hover:text-subtle text-muted rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2">
            <span className="sr-only">{t("settings")}</span>
            <Link href="/settings/my-account/profile">
              <Settings className="text-default h-4 w-4" aria-hidden="true" />
            </Link>
          </button>
          <UserDropdown small />
        </div>
      </nav>
    </>
  );
}

export const MobileNavigationMoreItems = () => (
  <ul className="border-subtle mt-2 rounded-md border">
    {mobileNavigationMoreItems.map((item) => (
      <MobileNavigationMoreItem key={item.name} item={item} />
    ))}
  </ul>
);
