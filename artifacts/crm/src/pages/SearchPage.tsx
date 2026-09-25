import { useState, useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, User, Building2, Landmark, TrendingUp, FileText, CheckSquare, Mail } from "lucide-react";

interface SearchResults {
  contacts: any[];
  organizations: any[];
  funders: any[];
  opportunities: any[];
  tickets: any[];
  tasks: any[];
  templates: any[];
  campaigns: any[];
}

const emptyResults: SearchResults = {
  contacts: [], organizations: [], funders: [], opportunities: [],
  tickets: [], tasks: [], templates: [], campaigns: [],
};

export default function SearchPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'SearchPage' });
  }, []);

  const [location, setLocation] = useLocation();
  const [results, setResults] = useState<SearchResults>(emptyResults);
  const [loading, setLoading] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const query = params.get("q") || "";

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults(emptyResults);
      return;
    }
    setLoading(true);
    api.get(`/search?q=${encodeURIComponent(query)}&full=1`)
      .then((data: any) => setResults(data))
      .catch(() => setResults(emptyResults))
      .finally(() => setLoading(false));
  }, [query]);

  const totalCount =
    results.contacts.length + results.organizations.length + results.funders.length +
    results.opportunities.length + results.tickets.length + results.tasks.length +
    results.templates.length + results.campaigns.length;

  if (!query || query.length < 2) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Search className="h-6 w-6 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900">Search</h1>
        </div>
        <p className="text-gray-500">Enter at least 2 characters to search</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Search results for '{query}'</h1>
        {!loading && <p className="text-sm text-gray-500 mt-1">{totalCount} result{totalCount !== 1 ? "s" : ""} found</p>}
      </div>

      {loading && <p className="text-gray-500">Searching...</p>}

      {!loading && totalCount === 0 && (
        <p className="text-gray-500">No results found for '{query}'</p>
      )}

      {!loading && results.contacts.length > 0 && (
        <ResultGroup title="Contacts" count={results.contacts.length}>
          {results.contacts.map((c) => (
            <ResultRow key={c.id} icon={<User className="h-4 w-4" />} onClick={() => setLocation(`/contacts/${c.id}`)}>
              <span className="font-medium">{c.firstName} {c.lastName}</span>
              <span className="text-gray-500 text-sm ml-2">{c.email}</span>
              <Badge variant="outline" className="ml-auto text-[10px]">Contact</Badge>
            </ResultRow>
          ))}
        </ResultGroup>
      )}

      {!loading && results.organizations.length > 0 && (
        <ResultGroup title="Organisations" count={results.organizations.length}>
          {results.organizations.map((o) => (
            <ResultRow key={o.id} icon={<Building2 className="h-4 w-4" />} onClick={() => setLocation(`/organizations/${o.id}`)}>
              <span className="font-medium">{o.name}</span>
              <span className="text-gray-500 text-sm ml-2">{o.type}</span>
              <Badge variant="outline" className="ml-auto text-[10px]">Organisation</Badge>
            </ResultRow>
          ))}
        </ResultGroup>
      )}

      {!loading && results.funders.length > 0 && (
        <ResultGroup title="Funders" count={results.funders.length}>
          {results.funders.map((f) => (
            <ResultRow key={f.id} icon={<Landmark className="h-4 w-4" />} onClick={() => setLocation(`/funders/${f.id}`)}>
              <span className="font-medium">{f.name}</span>
              <span className="text-gray-500 text-sm ml-2">{f.type}</span>
              <Badge variant="outline" className="ml-auto text-[10px]">Funder</Badge>
            </ResultRow>
          ))}
        </ResultGroup>
      )}

      {!loading && results.opportunities.length > 0 && (
        <ResultGroup title="Opportunities" count={results.opportunities.length}>
          {results.opportunities.map((o) => (
            <ResultRow key={o.id} icon={<TrendingUp className="h-4 w-4" />} onClick={() => setLocation(`/pipeline/${o.id}`)}>
              <span className="font-medium">{o.name}</span>
              <Badge variant="outline" className="text-[10px] ml-2">{o.stage}</Badge>
              {o.value && <span className="text-gray-500 text-sm ml-2">£{Number(o.value).toLocaleString()}</span>}
              <Badge variant="outline" className="ml-auto text-[10px]">Opportunity</Badge>
            </ResultRow>
          ))}
        </ResultGroup>
      )}

      {!loading && results.tickets.length > 0 && (
        <ResultGroup title="Support Tickets" count={results.tickets.length}>
          {results.tickets.map((t) => (
            <ResultRow key={t.id} icon={<FileText className="h-4 w-4" />} onClick={() => setLocation(`/support/tickets/${t.id}`)}>
              <span className="text-gray-500 text-xs mr-2">{t.ticketNumber}</span>
              <span className="font-medium">{t.title}</span>
              <Badge variant="outline" className="text-[10px] ml-2">{t.status}</Badge>
              <Badge variant="outline" className="ml-auto text-[10px]">Ticket</Badge>
            </ResultRow>
          ))}
        </ResultGroup>
      )}

      {!loading && results.tasks.length > 0 && (
        <ResultGroup title="Tasks" count={results.tasks.length}>
          {results.tasks.map((t) => (
            <ResultRow key={t.id} icon={<CheckSquare className="h-4 w-4" />} onClick={() => setLocation("/tasks")}>
              <span className="font-medium">{t.title}</span>
              <Badge variant="outline" className="text-[10px] ml-2">{t.status}</Badge>
              {t.dueDate && <span className="text-gray-500 text-xs ml-2">Due: {new Date(t.dueDate).toLocaleDateString()}</span>}
              <Badge variant="outline" className="ml-auto text-[10px]">Task</Badge>
            </ResultRow>
          ))}
        </ResultGroup>
      )}

      {!loading && results.templates.length > 0 && (
        <ResultGroup title="Email Templates" count={results.templates.length}>
          {results.templates.map((t) => (
            <ResultRow key={t.id} icon={<Mail className="h-4 w-4" />} onClick={() => setLocation(`/outreach/templates/${t.id}/edit`)}>
              <span className="font-medium">{t.name}</span>
              <span className="text-gray-500 text-sm ml-2">{t.subject}</span>
              <Badge variant="outline" className="ml-auto text-[10px]">Template</Badge>
            </ResultRow>
          ))}
        </ResultGroup>
      )}

      {!loading && results.campaigns.length > 0 && (
        <ResultGroup title="Campaigns" count={results.campaigns.length}>
          {results.campaigns.map((c) => (
            <ResultRow key={c.id} icon={<Mail className="h-4 w-4" />} onClick={() => setLocation(`/outreach/campaigns/${c.id}`)}>
              <span className="font-medium">{c.name}</span>
              <Badge variant="outline" className="text-[10px] ml-2">{c.status}</Badge>
              <Badge variant="outline" className="ml-auto text-[10px]">Campaign</Badge>
            </ResultRow>
          ))}
        </ResultGroup>
      )}
    </div>
  );
}

function ResultGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <Card className="border-gray-200">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">{title} ({count})</h2>
      </div>
      <CardContent className="p-0 divide-y divide-gray-100">
        {children}
      </CardContent>
    </Card>
  );
}

function ResultRow({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors"
    >
      <span className="text-gray-400 flex-shrink-0">{icon}</span>
      {children}
    </button>
  );
}
