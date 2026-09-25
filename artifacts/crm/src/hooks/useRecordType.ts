import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getRecordTypes, 
  getDefaultRecordType,
  getAdminRecordTypes, 
  getAdminRecordTypeById,
  createRecordType,
  updateRecordType,
  deleteRecordType,
  type RecordTypeConfig,
  type UserRecordTypeConfig 
} from "@/lib/api";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";

interface UseRecordTypeOptions {
  entityType?: string;
  admin?: boolean;
  activeOnly?: boolean;
}

/**
 * Hook for managing record type configurations
 * 
 * Provides:
 * - User-level record type selection (active types only)
 * - Admin-level record type management
 * - Default record type handling
 * - CRUD operations for record type configurations
 */
export function useRecordType(options: UseRecordTypeOptions = {}) {
  const { entityType, admin = false, activeOnly = true } = options;
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Determine if user has permission for admin operations
  const canManage = admin && isAdmin;

  // Query key based on options
  const queryKey = ['record-types', entityType, admin, activeOnly];

  // Main query for record type configurations
  const { 
    data: recordTypes = [], 
    isLoading, 
    error,
    refetch 
  } = useQuery({
    queryKey,
    queryFn: () => {
      if (!user) throw new Error("User not authenticated");
      
      if (admin && !isAdmin) {
        throw new Error("Insufficient permissions for admin record types");
      }

      if (admin) {
        // Admin endpoint - get all configurations
        return getAdminRecordTypes(entityType, activeOnly);
      } else {
        // User endpoint - get active record types for entity
        if (!entityType) {
          throw new Error("entityType is required for user record types");
        }
        return getRecordTypes(entityType);
      }
    },
    enabled: !!user && (!admin || isAdmin) && (!admin || !!entityType),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Query for default record type
  const { 
    data: defaultRecordType, 
    isLoading: isLoadingDefault 
  } = useQuery({
    queryKey: ['record-types', 'default', entityType],
    queryFn: () => {
      if (!user || !entityType) throw new Error("User not authenticated or entityType missing");
      return getDefaultRecordType(entityType);
    },
    enabled: !!user && !!entityType && !admin,
    staleTime: 5 * 60 * 1000,
  });

  // Get record type by ID or key
  const getRecordType = (identifier: string): RecordTypeConfig | UserRecordTypeConfig | undefined => {
    if (!identifier) return undefined;
    
    // Try to find by ID first
    let recordType = recordTypes.find(rt => rt.id === identifier);
    if (recordType) return recordType;
    
    // Try to find by recordType key
    recordType = recordTypes.find(rt => rt.recordType === identifier);
    return recordType;
  };

  // Get record type display name
  const getDisplayName = (identifier: string): string => {
    const recordType = getRecordType(identifier);
    return recordType?.displayName || identifier;
  };

  // Get record type icon
  const getIcon = (identifier: string): string | undefined => {
    const recordType = getRecordType(identifier);
    return recordType?.icon;
  };

  // Get record type color
  const getColor = (identifier: string): string | undefined => {
    const recordType = getRecordType(identifier);
    return recordType?.color;
  };

  // Check if record type is active
  const isActive = (identifier: string): boolean => {
    if (!admin) {
      // User endpoint only returns active types
      return getRecordType(identifier) !== undefined;
    }
    
    const recordType = getRecordType(identifier) as RecordTypeConfig | undefined;
    return recordType ? recordType.isActive !== false : false;
  };

  // Check if record type is default
  const isDefault = (identifier: string): boolean => {
    const recordType = getRecordType(identifier);
    return recordType ? recordType.isDefault === true : false;
  };

  // Get record type options for select inputs
  const getOptions = (): Array<{ value: string; label: string; icon?: string; color?: string }> => {
    return recordTypes.map(rt => ({
      value: rt.recordType,
      label: rt.displayName,
      icon: rt.icon,
      color: rt.color,
    }));
  };

  // Get sorted record types (by sortOrder, then displayName)
  const getSortedRecordTypes = (): (RecordTypeConfig | UserRecordTypeConfig)[] => {
    return [...recordTypes].sort((a, b) => {
      // Sort by sortOrder first
      if ((a as any).sortOrder !== (b as any).sortOrder) {
        return ((a as any).sortOrder || 0) - ((b as any).sortOrder || 0);
      }
      // Then by display name
      return a.displayName.localeCompare(b.displayName);
    });
  };

  // Mutation for creating record type (admin only)
  const createMutation = useMutation({
    mutationFn: createRecordType,
    onMutate: async (newRecordType) => {
      await queryClient.cancelQueries({ queryKey });
      
      const previousRecordTypes = queryClient.getQueryData<RecordTypeConfig[]>(queryKey);
      
      if (previousRecordTypes) {
        // Optimistically add new record type
        const tempRecordType: RecordTypeConfig = {
          id: 'temp-' + Date.now(),
          tenantId: (user as any)?.tenantId || '',
          entityType: newRecordType.entityType,
          recordType: newRecordType.recordType,
          displayName: newRecordType.displayName,
          description: newRecordType.description,
          icon: newRecordType.icon,
          color: newRecordType.color,
          isDefault: newRecordType.isDefault || false,
          isActive: newRecordType.isActive !== undefined ? newRecordType.isActive : true,
          sortOrder: newRecordType.sortOrder || 0,
          allowedTransitions: newRecordType.allowedTransitions,
          validationRules: newRecordType.validationRules,
          workflowRules: newRecordType.workflowRules,
          metadata: newRecordType.metadata,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: user?.id,
        };
        
        queryClient.setQueryData(queryKey, [...previousRecordTypes, tempRecordType]);
      }
      
      return { previousRecordTypes };
    },
    onError: (err, newRecordType, context) => {
      if (context?.previousRecordTypes) {
        queryClient.setQueryData(queryKey, context.previousRecordTypes);
      }
      
      toast({
        title: "Error",
        description: "Failed to create record type",
        variant: "destructive",
      });
    },
    onSuccess: (createdRecordType) => {
      queryClient.invalidateQueries({ queryKey });
      
      toast({
        title: "Success",
        description: "Record type created successfully",
      });
    },
  });

  // Mutation for updating record type (admin only)
  const updateMutation = useMutation({
    mutationFn: ({ id, config }: { id: string; config: Parameters<typeof updateRecordType>[1] }) =>
      updateRecordType(id, config),
    onMutate: async ({ id, config }) => {
      await queryClient.cancelQueries({ queryKey });
      
      const previousRecordTypes = queryClient.getQueryData<RecordTypeConfig[]>(queryKey);
      
      if (previousRecordTypes) {
        // Optimistically update the record type
        const updatedRecordTypes = previousRecordTypes.map(rt => 
          rt.id === id 
            ? { ...rt, ...config, updatedAt: new Date().toISOString(), updatedBy: user?.id }
            : rt
        );
        
        queryClient.setQueryData(queryKey, updatedRecordTypes);
      }
      
      return { previousRecordTypes };
    },
    onError: (err, variables, context) => {
      if (context?.previousRecordTypes) {
        queryClient.setQueryData(queryKey, context.previousRecordTypes);
      }
      
      toast({
        title: "Error",
        description: "Failed to update record type",
        variant: "destructive",
      });
    },
    onSuccess: (updatedRecordType) => {
      queryClient.invalidateQueries({ queryKey });
      
      toast({
        title: "Success",
        description: "Record type updated successfully",
      });
    },
  });

  // Mutation for deleting record type (admin only)
  const deleteMutation = useMutation({
    mutationFn: deleteRecordType,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      
      const previousRecordTypes = queryClient.getQueryData<RecordTypeConfig[]>(queryKey);
      
      if (previousRecordTypes) {
        // Optimistically remove the record type
        const updatedRecordTypes = previousRecordTypes.filter(rt => rt.id !== id);
        queryClient.setQueryData(queryKey, updatedRecordTypes);
      }
      
      return { previousRecordTypes };
    },
    onError: (err, id, context) => {
      if (context?.previousRecordTypes) {
        queryClient.setQueryData(queryKey, context.previousRecordTypes);
      }
      
      toast({
        title: "Error",
        description: "Failed to delete record type",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      
      toast({
        title: "Success",
        description: "Record type deleted successfully",
      });
    },
  });

  // Helper functions for common operations
  const create = (config: Parameters<typeof createMutation.mutate>[0]) => {
    if (!canManage) {
      toast({
        title: "Permission Denied",
        description: "You do not have permission to create record types",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(config);
  };

  const update = (id: string, config: Parameters<typeof updateMutation.mutate>[0]['config']) => {
    if (!canManage) {
      toast({
        title: "Permission Denied",
        description: "You do not have permission to update record types",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({ id, config });
  };

  const remove = (id: string) => {
    if (!canManage) {
      toast({
        title: "Permission Denied",
        description: "You do not have permission to delete record types",
        variant: "destructive",
      });
      return;
    }
    deleteMutation.mutate(id);
  };

  // Set a record type as default
  const setAsDefault = (id: string) => {
    if (!canManage) {
      toast({
        title: "Permission Denied",
        description: "You do not have permission to set default record types",
        variant: "destructive",
      });
      return;
    }
    
    const recordType = getRecordType(id) as RecordTypeConfig | undefined;
    if (!recordType) {
      toast({
        title: "Error",
        description: "Record type not found",
        variant: "destructive",
      });
      return;
    }
    
    update(id, { isDefault: true });
  };

  // Toggle record type active state
  const toggleActive = (id: string, active: boolean) => {
    if (!canManage) {
      toast({
        title: "Permission Denied",
        description: "You do not have permission to toggle record type status",
        variant: "destructive",
      });
      return;
    }
    
    const recordType = getRecordType(id) as RecordTypeConfig | undefined;
    if (!recordType) {
      toast({
        title: "Error",
        description: "Record type not found",
        variant: "destructive",
      });
      return;
    }
    
    // Cannot deactivate default record type if it's the only one
    if (!active && recordType.isDefault) {
      const activeRecordTypes = recordTypes.filter(rt => 
        (rt as any).entityType === (recordType as any).entityType && 
        (rt as RecordTypeConfig).isActive !== false
      );
      
      if (activeRecordTypes.length <= 1) {
        toast({
          title: "Error",
          description: "Cannot deactivate the only active record type",
          variant: "destructive",
        });
        return;
      }
    }
    
    update(id, { isActive: active });
  };

  return {
    // Data
    recordTypes,
    defaultRecordType,
    isLoading: isLoading || (isLoadingDefault && !admin),
    error,
    
    // Permission
    canManage,
    
    // Record type inspection
    getRecordType,
    getDisplayName,
    getIcon,
    getColor,
    isActive,
    isDefault,
    getOptions,
    getSortedRecordTypes,
    
    // Operations (admin only)
    create,
    update,
    remove,
    setAsDefault,
    toggleActive,
    createMutation,
    updateMutation,
    deleteMutation,
    
    // Utilities
    refetch,
  };
}

/**
 * Convenience hook for user-level record types
 */
export function useUserRecordTypes(entityType: string) {
  return useRecordType({ entityType, admin: false, activeOnly: true });
}

/**
 * Convenience hook for admin-level record type management
 */
export function useAdminRecordTypes(entityType?: string, activeOnly?: boolean) {
  return useRecordType({ entityType, admin: true, activeOnly });
}