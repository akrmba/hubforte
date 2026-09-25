import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getFieldVisibility, 
  getAdminFieldVisibility, 
  getAdminFieldVisibilityByPath,
  saveFieldVisibility,
  batchSaveFieldVisibility,
  deleteFieldVisibility,
  type FieldVisibilityConfig,
  type UserFieldVisibilityConfig 
} from "@/lib/api";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";

interface UseFieldVisibilityOptions {
  entityType?: string;
  admin?: boolean;
}

/**
 * Hook for managing field visibility configurations
 * 
 * Provides:
 * - User-level field visibility (filtered by role)
 * - Admin-level field visibility management
 * - CRUD operations for field configurations
 * - Optimistic updates and caching
 */
export function useFieldVisibility(options: UseFieldVisibilityOptions = {}) {
  const { entityType, admin = false } = options;
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Determine if user has permission for admin operations
  const canManage = admin && isAdmin;

  // Query key based on options
  const queryKey = ['field-visibility', entityType, admin];

  // Main query for field visibility configurations
  const {
    data: configs = [] as any[],
    isLoading,
    error,
    refetch
  } = useQuery<any[]>({
    queryKey,
    queryFn: async () => {
      if (!user) throw new Error("User not authenticated");
      
      if (admin && !isAdmin) {
        throw new Error("Insufficient permissions for admin field visibility");
      }

      if (admin) {
        // Admin endpoint - get all configurations (optionally filtered by entityType)
        return getAdminFieldVisibility(entityType);
      } else {
        // User endpoint - get role-filtered configurations for entity
        if (!entityType) {
          throw new Error("entityType is required for user field visibility");
        }
        return getFieldVisibility(entityType);
      }
    },
    enabled: !!user && (!admin || isAdmin) && (!admin || !!entityType),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get specific field configuration
  const getFieldConfig = (fieldPath: string): UserFieldVisibilityConfig | FieldVisibilityConfig | undefined => {
    return configs.find(config => config.fieldPath === fieldPath);
  };

  // Check if field is visible to current user
  const isFieldVisible = (fieldPath: string): boolean => {
    if (!admin) {
      // User endpoint already filters by role
      const config = configs.find(c => c.fieldPath === fieldPath);
      return config ? config.visible !== false : true; // Default to visible if no config
    }
    // Admin sees everything
    return true;
  };

  // Check if field is required for current user
  const isFieldRequired = (fieldPath: string): boolean => {
    const config = configs.find(c => c.fieldPath === fieldPath);
    return config ? config.required === true : false; // Default to not required
  };

  // Check if field can be edited by current user
  const canEditField = (fieldPath: string): boolean => {
    if (!admin) {
      const config = configs.find(c => c.fieldPath === fieldPath) as UserFieldVisibilityConfig | undefined;
      return config ? config.canEdit === true : true; // Default to editable
    }
    // Admin can edit everything
    return true;
  };

  // Get field label (with override if available)
  const getFieldLabel = (fieldPath: string, defaultLabel: string): string => {
    const config = configs.find(c => c.fieldPath === fieldPath);
    return config?.labelOverride || defaultLabel;
  };

  // Get field help text
  const getFieldHelpText = (fieldPath: string): string | undefined => {
    const config = configs.find(c => c.fieldPath === fieldPath);
    return config?.helpText;
  };

  // Get field validation rules
  const getFieldValidationRules = (fieldPath: string): any | undefined => {
    const config = configs.find(c => c.fieldPath === fieldPath);
    return config?.validationRules;
  };

  // Get sorted fields by display order
  const getSortedFields = (fieldPaths: string[]): string[] => {
    const configMap = new Map(configs.map(config => [config.fieldPath, config]));
    
    return [...fieldPaths].sort((a, b) => {
      const configA = configMap.get(a);
      const configB = configMap.get(b);
      
      const orderA = (configA as any)?.displayOrder || '9999';
      const orderB = (configB as any)?.displayOrder || '9999';
      
      return orderA.localeCompare(orderB);
    });
  };

  // Mutation for saving field configuration (admin only)
  const saveConfigMutation = useMutation({
    mutationFn: saveFieldVisibility,
    onMutate: async (newConfig) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });
      
      // Snapshot the previous value
      const previousConfigs = queryClient.getQueryData<FieldVisibilityConfig[]>(queryKey);
      
      // Optimistically update to the new value
      if (previousConfigs) {
        const existingIndex = previousConfigs.findIndex(
          config => config.entityType === newConfig.entityType && config.fieldPath === newConfig.fieldPath
        );
        
        if (existingIndex >= 0) {
          // Update existing
          const updatedConfigs = [...previousConfigs];
          updatedConfigs[existingIndex] = {
            ...updatedConfigs[existingIndex],
            ...newConfig,
            updatedAt: new Date().toISOString(),
            updatedBy: user?.id,
          };
          queryClient.setQueryData(queryKey, updatedConfigs);
        } else {
          // Add new (with placeholder ID)
          const newConfigWithId: FieldVisibilityConfig = {
            id: 'temp-' + Date.now(),
            tenantId: (user as any)?.tenantId || '',
            entityType: newConfig.entityType,
            fieldPath: newConfig.fieldPath,
            visible: newConfig.visible ?? true,
            required: newConfig.required ?? false,
            labelOverride: newConfig.labelOverride,
            helpText: newConfig.helpText,
            validationRules: newConfig.validationRules,
            displayOrder: newConfig.displayOrder,
            visibleToRoles: newConfig.visibleToRoles,
            editableByRoles: newConfig.editableByRoles,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updatedBy: user?.id,
          };
          queryClient.setQueryData(queryKey, [...previousConfigs, newConfigWithId]);
        }
      }
      
      return { previousConfigs };
    },
    onError: (err, newConfig, context) => {
      // Rollback on error
      if (context?.previousConfigs) {
        queryClient.setQueryData(queryKey, context.previousConfigs);
      }
      
      toast({
        title: "Error",
        description: "Failed to save field configuration",
        variant: "destructive",
      });
    },
    onSuccess: (savedConfig) => {
      // Invalidate and refetch to ensure we have correct data
      queryClient.invalidateQueries({ queryKey });
      
      toast({
        title: "Success",
        description: "Field configuration saved",
      });
    },
  });

  // Mutation for batch saving (admin only)
  const batchSaveMutation = useMutation({
    mutationFn: batchSaveFieldVisibility,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      
      toast({
        title: "Success",
        description: "Field configurations updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update field configurations",
        variant: "destructive",
      });
    },
  });

  // Mutation for deleting field configuration (admin only)
  const deleteConfigMutation = useMutation({
    mutationFn: ({ entityType, fieldPath }: { entityType: string; fieldPath: string }) =>
      deleteFieldVisibility(entityType, fieldPath),
    onMutate: async ({ entityType, fieldPath }) => {
      await queryClient.cancelQueries({ queryKey });
      
      const previousConfigs = queryClient.getQueryData<FieldVisibilityConfig[]>(queryKey);
      
      if (previousConfigs) {
        const updatedConfigs = previousConfigs.filter(
          config => !(config.entityType === entityType && config.fieldPath === fieldPath)
        );
        queryClient.setQueryData(queryKey, updatedConfigs);
      }
      
      return { previousConfigs };
    },
    onError: (err, variables, context) => {
      if (context?.previousConfigs) {
        queryClient.setQueryData(queryKey, context.previousConfigs);
      }
      
      toast({
        title: "Error",
        description: "Failed to delete field configuration",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      
      toast({
        title: "Success",
        description: "Field configuration deleted",
      });
    },
  });

  // Helper functions for common operations
  const saveConfig = (config: Parameters<typeof saveConfigMutation.mutate>[0]) => {
    if (!canManage) {
      toast({
        title: "Permission Denied",
        description: "You do not have permission to manage field configurations",
        variant: "destructive",
      });
      return;
    }
    saveConfigMutation.mutate(config);
  };

  const batchSave = (updates: Parameters<typeof batchSaveMutation.mutate>[0]) => {
    if (!canManage) {
      toast({
        title: "Permission Denied",
        description: "You do not have permission to manage field configurations",
        variant: "destructive",
      });
      return;
    }
    batchSaveMutation.mutate(updates);
  };

  const deleteConfig = (entityType: string, fieldPath: string) => {
    if (!canManage) {
      toast({
        title: "Permission Denied",
        description: "You do not have permission to delete field configurations",
        variant: "destructive",
      });
      return;
    }
    deleteConfigMutation.mutate({ entityType, fieldPath });
  };

  return {
    // Data
    configs,
    isLoading,
    error,
    
    // Permission
    canManage,
    
    // Field inspection
    getFieldConfig,
    isFieldVisible,
    isFieldRequired,
    canEditField,
    getFieldLabel,
    getFieldHelpText,
    getFieldValidationRules,
    getSortedFields,
    
    // Operations (admin only)
    saveConfig,
    batchSave,
    deleteConfig,
    saveConfigMutation,
    batchSaveMutation,
    deleteConfigMutation,
    
    // Utilities
    refetch,
  };
}

/**
 * Convenience hook for user-level field visibility
 */
export function useUserFieldVisibility(entityType: string) {
  return useFieldVisibility({ entityType, admin: false });
}

/**
 * Convenience hook for admin-level field visibility management
 */
export function useAdminFieldVisibility(entityType?: string) {
  return useFieldVisibility({ entityType, admin: true });
}