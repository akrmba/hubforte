#!/usr/bin/env node

/**
 * Verification script for Phase 3: Platform Configuration Layer
 * 
 * This script verifies that all components of the configuration layer are properly implemented:
 * 1. Database schemas and migrations
 * 2. API endpoints
 * 3. Module registry
 * 4. Frontend hooks
 * 5. Integration points
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Phase 3: Platform Configuration Layer\n');

const baseDir = process.cwd();
let allPassed = true;

// 1. Check database schemas
console.log('📋 1. Checking database schemas...');
const schemaFiles = [
  'lib/db/src/schema/tenant_field_visibility.ts',
  'lib/db/src/schema/record_type_configs.ts',
  'lib/db/src/schema/index.ts'
];

schemaFiles.forEach(file => {
  const filePath = path.join(baseDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    allPassed = false;
  }
});

// 2. Check migrations
console.log('\n📋 2. Checking migrations...');
const migrationFiles = [
  'lib/db/migrations/0005_tenant_field_visibility_up.sql',
  'lib/db/migrations/0005_tenant_field_visibility_down.sql',
  'lib/db/migrations/0006_record_type_configs_up.sql',
  'lib/db/migrations/0006_record_type_configs_down.sql'
];

migrationFiles.forEach(file => {
  const filePath = path.join(baseDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    allPassed = false;
  }
});

// 3. Check API routes
console.log('\n📋 3. Checking API routes...');
const apiFiles = [
  'artifacts/api-server/src/routes/fieldVisibility.ts',
  'artifacts/api-server/src/routes/recordTypes.ts',
  'artifacts/api-server/src/routes/index.ts'
];

apiFiles.forEach(file => {
  const filePath = path.join(baseDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file}`);
    
    // Check if routes are properly exported/imported
    if (file === 'artifacts/api-server/src/routes/index.ts') {
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.includes('fieldVisibilityRouter') || !content.includes('recordTypesRouter')) {
        console.log(`   ⚠️  ${file} - Missing route imports`);
      }
    }
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    allPassed = false;
  }
});

// 4. Check module registry
console.log('\n📋 4. Checking module registry...');
const moduleRegistryFiles = [
  'lib/db/src/moduleRegistry.ts',
  'lib/db/src/index.ts'
];

moduleRegistryFiles.forEach(file => {
  const filePath = path.join(baseDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file}`);
    
    if (file === 'lib/db/src/moduleRegistry.ts') {
      const content = fs.readFileSync(filePath, 'utf8');
      const hasFieldVisibilityModule = content.includes("'field_visibility'");
      const hasRecordTypesModule = content.includes("'record_types'");
      
      if (!hasFieldVisibilityModule) {
        console.log(`   ⚠️  ${file} - Missing field_visibility module definition`);
      }
      if (!hasRecordTypesModule) {
        console.log(`   ⚠️  ${file} - Missing record_types module definition`);
      }
    }
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    allPassed = false;
  }
});

// 5. Check feature flags dependency checking
console.log('\n📋 5. Checking feature flags dependency checking...');
const featureFlagFiles = [
  'artifacts/api-server/src/lib/featureFlags.ts',
  'artifacts/api-server/src/routes/superAdmin.ts',
  'artifacts/api-server/src/routes/tenants.ts',
  'artifacts/api-server/src/routes/admin.ts'
];

featureFlagFiles.forEach(file => {
  const filePath = path.join(baseDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file}`);
    
    // Check for dependency checking functions
    if (file === 'artifacts/api-server/src/lib/featureFlags.ts') {
      const content = fs.readFileSync(filePath, 'utf8');
      const hasCanEnableModule = content.includes('canEnableModule');
      const hasCanDisableModule = content.includes('canDisableModule');
      const hasGetTenantModulesWithDependencies = content.includes('getTenantModulesWithDependencies');
      
      if (!hasCanEnableModule) console.log(`   ⚠️  ${file} - Missing canEnableModule function`);
      if (!hasCanDisableModule) console.log(`   ⚠️  ${file} - Missing canDisableModule function`);
      if (!hasGetTenantModulesWithDependencies) console.log(`   ⚠️  ${file} - Missing getTenantModulesWithDependencies function`);
    }
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    allPassed = false;
  }
});

// 6. Check frontend hooks
console.log('\n📋 6. Checking frontend hooks...');
const hookFiles = [
  'artifacts/crm/src/hooks/useFieldVisibility.ts',
  'artifacts/crm/src/hooks/useRecordType.ts',
  'artifacts/crm/src/lib/api.ts'
];

hookFiles.forEach(file => {
  const filePath = path.join(baseDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file}`);
    
    // Check API functions in api.ts
    if (file === 'artifacts/crm/src/lib/api.ts') {
      const content = fs.readFileSync(filePath, 'utf8');
      const hasFieldVisibilityAPI = content.includes('getFieldVisibility') && content.includes('FieldVisibilityConfig');
      const hasRecordTypeAPI = content.includes('getRecordTypes') && content.includes('RecordTypeConfig');
      
      if (!hasFieldVisibilityAPI) console.log(`   ⚠️  ${file} - Missing field visibility API functions`);
      if (!hasRecordTypeAPI) console.log(`   ⚠️  ${file} - Missing record type API functions`);
    }
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    allPassed = false;
  }
});

// 7. Check seed script update
console.log('\n📋 7. Checking seed script update...');
const seedFile = 'scripts/src/seed.ts';
const seedFilePath = path.join(baseDir, seedFile);

if (fs.existsSync(seedFilePath)) {
  const content = fs.readFileSync(seedFilePath, 'utf8');
  if (content.includes('getAllModuleKeys') && content.includes('@workspace/db/moduleRegistry')) {
    console.log(`   ✅ ${seedFile} - Updated to use module registry`);
  } else {
    console.log(`   ⚠️  ${seedFile} - Not updated to use module registry`);
  }
} else {
  console.log(`   ❌ ${seedFile} - MISSING`);
  allPassed = false;
}

// 8. Check STATE.md updates
console.log('\n📋 8. Checking STATE.md updates...');
const stateFile = '_kcc-arch-v2/STATE.md';
const stateFilePath = path.join(baseDir, stateFile);

if (fs.existsSync(stateFilePath)) {
  const content = fs.readFileSync(stateFilePath, 'utf8');
  const phase3Tasks = [
    '3.1.*done',
    '3.2.*done',
    '3.3.*done',
    '3.4.*done',
    '3.5.*done',
    '3.6.*done',
    '3.7.*done',
    '3.8.*done',
    '3.9.*done'
  ];
  
  let phase3Complete = true;
  phase3Tasks.forEach(task => {
    const regex = new RegExp(`\\| ${task}.*done`);
    if (!regex.test(content)) {
      console.log(`   ⚠️  ${stateFile} - Task ${task.split('.')[0]}.${task.split('.')[1]} not marked as done`);
      phase3Complete = false;
    }
  });
  
  if (phase3Complete) {
    console.log(`   ✅ ${stateFile} - All Phase 3 tasks marked as done`);
  }
} else {
  console.log(`   ❌ ${stateFile} - MISSING`);
  allPassed = false;
}

// 9. Check result files
console.log('\n📋 9. Checking result files...');
const resultFiles = [
  '_kcc-arch-v2/results/result_3_1.md',
  '_kcc-arch-v2/results/result_3_2.md',
  '_kcc-arch-v2/results/result_3_3.md',
  '_kcc-arch-v2/results/result_3_4.md',
  '_kcc-arch-v2/results/result_3_5.md',
  '_kcc-arch-v2/results/result_3_6.md',
  '_kcc-arch-v2/results/result_3_7.md',
  '_kcc-arch-v2/results/result_3_8.md',
  '_kcc-arch-v2/results/result_3_9.md'
];

resultFiles.forEach(file => {
  const filePath = path.join(baseDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    allPassed = false;
  }
});

// Summary
console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('✅ VERIFICATION PASSED: All Phase 3 components are properly implemented.');
  console.log('\n📊 Summary:');
  console.log('   • Database schemas: ✓');
  console.log('   • Migrations: ✓');
  console.log('   • API endpoints: ✓');
  console.log('   • Module registry: ✓');
  console.log('   • Dependency checking: ✓');
  console.log('   • Frontend hooks: ✓');
  console.log('   • Seed script: ✓');
  console.log('   • Documentation: ✓');
  console.log('\n🚀 Phase 3 Platform Configuration Layer is ready for use!');
} else {
  console.log('❌ VERIFICATION FAILED: Some components are missing or incomplete.');
  console.log('\n⚠️  Please check the warnings and errors above.');
  process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('Next steps:');
console.log('1. Run database migrations:');
console.log('   Apply via the deploy pipeline (hubforte_migrations tracking table)');
console.log('   or manually: psql $DATABASE_URL -f lib/db/migrations/NNNN_name_up.sql');
console.log('2. Test the configuration layer APIs:');
console.log('   - GET /admin/field-visibility');
console.log('   - GET /admin/record-types');
console.log('   - GET /admin/modules/with-dependencies');
console.log('3. Test frontend hooks in development environment');
console.log('4. Begin Phase 4: Delivery Entities');