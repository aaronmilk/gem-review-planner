import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Router, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Layout from "@/pages/Layout";
import Dashboard from "@/pages/Dashboard";
import Logbook from "@/pages/Logbook";
import Analysis from "@/pages/Analysis";
import Plan from "@/pages/Plan";
import Settings from "@/pages/Settings";
import Pool from "@/pages/Pool";

function AppRouter() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/">
          <Layout>
            <Dashboard />
          </Layout>
        </Route>
        <Route path="/log">
          <Layout>
            <Logbook />
          </Layout>
        </Route>
        <Route path="/analysis">
          <Layout>
            <Analysis />
          </Layout>
        </Route>
        <Route path="/plan">
          <Layout>
            <Plan />
          </Layout>
        </Route>
        <Route path="/pool">
          <Layout>
            <Pool />
          </Layout>
        </Route>
        <Route path="/settings">
          <Layout>
            <Settings />
          </Layout>
        </Route>
        <Route>
          <Layout>
            <Dashboard />
          </Layout>
        </Route>
      </Switch>
    </Router>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      {/* Dark-first terminal UI */}
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <AppRouter />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
