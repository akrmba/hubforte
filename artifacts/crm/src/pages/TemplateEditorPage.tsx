import { useEffect } from "react";
import { logUserAction } from "../lib/analytics";
import { useRoute, useLocation } from "wouter";
import { useGetTemplate, getGetTemplateQueryKey, useCreateTemplate, useUpdateTemplate, getListTemplatesQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Variable } from "lucide-react";

const templateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Template body is required"),
});

export default function TemplateEditorPage() {
  useEffect(() => {
    logUserAction('page_view', { page: 'TemplateEditorPage' });
  }, []);

  const [, params] = useRoute("/outreach/templates/:id/edit");
  const id = params?.id;
  const isEdit = !!id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tpl, isLoading } = useGetTemplate(id || "", {
    query: { enabled: isEdit, queryKey: getGetTemplateQueryKey(id || "") }
  });

  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();

  const form = useForm<z.infer<typeof templateSchema>>({
    resolver: zodResolver(templateSchema as any),
    defaultValues: { name: "", subject: "", body: "" }
  });

  useEffect(() => {
    if (tpl) {
      form.reset({ name: tpl.name, subject: tpl.subject, body: tpl.body });
    }
  }, [tpl, form]);

  const onSubmit = (values: z.infer<typeof templateSchema>) => {
    if (isEdit) {
      updateMutation.mutate({ id: id!, data: values }, {
        onSuccess: () => {
          toast({ title: "Template updated" });
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          setLocation("/outreach/templates");
        }
      });
    } else {
      createMutation.mutate({ data: values }, {
        onSuccess: () => {
          toast({ title: "Template created" });
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          setLocation("/outreach/templates");
        }
      });
    }
  };

  const bodyValue = form.watch("body");
  const subjectValue = form.watch("subject");

  // Extract variables safely using regex
  const getVariables = (text: string) => {
    const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
    return Array.from(new Set(matches.map(m => m.replace(/[{}]/g, '').trim())));
  };

  const variables = Array.from(new Set([...getVariables(bodyValue), ...getVariables(subjectValue)]));

  if (isEdit && isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{isEdit ? "Edit Template" : "New Template"}</h1>
          <p className="text-sm text-gray-500 mt-1">Design email templates with dynamic variables.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="shadow-sm border-gray-200">
          <CardContent className="p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl><Input placeholder="e.g. Initial Outreach" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="subject" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Subject</FormLabel>
                    <FormControl><Input placeholder="Hello {{firstName}}" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="body" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Body</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Hi {{firstName}}, ..." className="min-h-[300px] font-mono text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <Button type="button" variant="outline" onClick={() => setLocation("/outreach/templates")}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="bg-blue-600">
                    {isEdit ? "Update Template" : "Save Template"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-slate-50 border border-gray-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-200 bg-white rounded-t-xl">
              <CardTitle className="text-sm font-semibold flex items-center text-gray-700">
                <Variable className="h-4 w-4 mr-2 text-blue-500" /> Detected Variables
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {variables.length === 0 ? (
                <p className="text-sm text-gray-500">Use {'{{variableName}}'} to add dynamic data to your template.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {variables.map(v => (
                    <span key={v} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-mono border border-blue-200">
                      {v}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-gray-200 bg-gray-50">
              <CardTitle className="text-sm font-semibold text-gray-700">Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-4 border-b border-gray-100 bg-white">
                <p className="text-xs text-gray-500 mb-1">Subject:</p>
                <p className="text-sm font-semibold text-gray-900">
                  {subjectValue ? subjectValue.replace(/\{\{([^}]+)\}\}/g, (match, p1) => `[${p1}]`) : "No subject"}
                </p>
              </div>
              <div className="p-6 bg-white min-h-[250px]">
                <p className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                  {bodyValue ? bodyValue.replace(/\{\{([^}]+)\}\}/g, (match, p1) => `[${p1}]`) : "Preview will appear here..."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
