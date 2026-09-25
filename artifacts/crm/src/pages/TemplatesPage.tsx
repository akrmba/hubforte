import { useEffect } from 'react';
import { useListTemplates, getListTemplatesQueryKey } from "@workspace/api-client-react";
import { logUserAction } from "../lib/analytics";
import { Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

export default function TemplatesPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'TemplatesPage' });
  }, []);

  const [page, setPage] = useState(1);
  const { data: templatesResponse, isLoading } = useListTemplates({ page, limit: 25 } as any);

  const templates = Array.isArray(templatesResponse) ? templatesResponse : (templatesResponse as any)?.data ?? [];
  const totalPages = Array.isArray(templatesResponse) ? 1 : (templatesResponse as any)?.totalPages ?? 1;
  const currentPage = Array.isArray(templatesResponse) ? 1 : (templatesResponse as any)?.page ?? 1;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Email Templates</h1>
        <Link href="/outreach/templates/new"><Button><Plus className="mr-2 h-4 w-4" /> New Template</Button></Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={3}>Loading...</TableCell></TableRow> :
              templates.map((tpl: any) => (
                <TableRow key={tpl.id}>
                  <TableCell className="font-medium">{tpl.name}</TableCell>
                  <TableCell className="text-gray-600">{tpl.subject}</TableCell>
                  <TableCell>
                    <Link href={`/outreach/templates/${tpl.id}/edit`}>
                      <Button variant="ghost" size="sm">Edit</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem className="px-4 text-sm text-gray-500">
              Page {currentPage} of {totalPages}
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
