import Link from "next/link";
import type { ReactNode } from "react";
import { HomeIcon } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export type PageBreadcrumbItem = {
  label: ReactNode;
  href?: string;
};

export type PageBreadcrumbProps = {
  items: PageBreadcrumbItem[];
  subtitle?: ReactNode;
  className?: string;
};

export function PageBreadcrumb({ items, subtitle, className }: PageBreadcrumbProps) {
  return (
    <nav className={`mb-6 sm:mb-8 pb-4 sm:pb-5 border-b border-border ${className ?? ""}`}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/" aria-label="Strona główna">
                <HomeIcon className="size-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            return (
              <span key={idx} className="contents">
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {item.href && !isLast ? (
                    <BreadcrumbLink asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </span>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {subtitle && (
        <p className="font-mono text-[11px] text-muted-foreground tracking-wide mt-2">
          {subtitle}
        </p>
      )}
    </nav>
  );
}
