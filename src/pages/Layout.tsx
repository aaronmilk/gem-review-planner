/*
Design System Reminder (Layout)
- Neo Terminal × Quant Ledger: grid texture, acid green accents, monospace numbers
*/

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Activity,
  ClipboardList,
  LineChart,
  Settings as SettingsIcon,
  WandSparkles,
  Droplets,
} from "lucide-react";

const nav = [
  { href: "/", label: "仪表盘", icon: Activity },
  { href: "/log", label: "复盘记录", icon: ClipboardList },
  { href: "/analysis", label: "统计分析", icon: LineChart },
  { href: "/plan", label: "次日预案", icon: WandSparkles },
  { href: "/pool", label: "蓄水池", icon: Droplets },
  { href: "/settings", label: "设置", icon: SettingsIcon },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  // 让“容量复盘台”在点击外部区域时自动收回（桌面端 offcanvas）
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!sidebarOpen) return;
      const t = e.target as Node | null;
      if (!t) return;

      // 点击在侧边栏内部 or 触发器上：不收回
      if (sidebarRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;

      // 其他区域：收回
      setSidebarOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [sidebarOpen]);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="min-h-screen w-full bg-background text-foreground bg-grid bg-noise">
        <div ref={sidebarRef}>
          <Sidebar className="border-r border-border/70 bg-sidebar/90 backdrop-blur">
          <SidebarHeader className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/15 shadow-glow flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-primary" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-xl leading-tight">容量复盘台</div>
                <div className="text-xs text-muted-foreground mt-0.5">GEM · 日度记录 · 次日预案</div>
              </div>
            </div>
            <Separator className="mt-4 bg-border/60" />
          </SidebarHeader>

          <SidebarContent className="px-2">
            <SidebarMenu>
              {nav.map((item) => {
                const Icon = item.icon;
                const active = location === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={item.href}>
                        <span
                          className={cn(
                            "flex items-center gap-2",
                            active ? "text-primary" : "text-sidebar-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="truncate">{item.label}</span>
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-4">
            <Separator className="mb-3 bg-border/60" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              数据默认保存在本地浏览器（localStorage）。建议每周在“设置”导出备份。
            </div>
          </SidebarFooter>
          </Sidebar>
        </div>

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-10 border-b border-border/70 bg-background/70 backdrop-blur">
            <div className="mx-auto max-w-[1200px] px-4 py-3 flex items-center gap-3">
              <span ref={triggerRef}>
                <SidebarTrigger />
              </span>
              <div className="flex-1">
                <div className="font-display text-lg leading-none">创业板容量复盘与次日预案</div>
                <div className="text-xs text-muted-foreground mt-1">把关键数据变成可复用的规则</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-border/70 bg-card/30"
                asChild
              >
                <Link href="/log">开始记录</Link>
              </Button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1200px] px-4 py-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
