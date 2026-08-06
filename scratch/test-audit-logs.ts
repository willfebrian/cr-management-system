import express from 'express';
import { crRoutes } from '../src/server/routes/crRoutes.js';
import { projectRoutes } from '../src/server/routes/projectRoutes.js';
import { userRoutes } from '../src/server/routes/userRoutes.js';
import { auditRoutes } from '../src/server/routes/auditRoutes.js';
import { authRoutes } from '../src/server/routes/authRoutes.js';
import { pool, assertDatabaseConfigured } from '../src/server/db/pool.js';
import { recordActivityLog } from '../src/server/db/auditRepository.js';

async function runTests() {
  console.log("=== STARTING ROUTE AUDIT LOG TEST ===");
  await assertDatabaseConfigured();

  const app = express();
  app.use(express.json());

  // Mock Authentication Middleware
  app.use((req, res, next) => {
    // @ts-ignore
    req.authUser = { id: 1, username: 'TEST_ADMIN', role: 'ADMIN' };
    // @ts-ignore
    req.user = req.authUser;
    next();
  });

  app.use('/api/auth', authRoutes); // Auth uses slightly different session mechanics, but we can test change-password maybe
  app.use('/api/cr', crRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/audit', auditRoutes);

  const server = app.listen(0, async () => {
    const port = (server.address() as any).port;
    const baseUrl = `http://localhost:${port}`;

    try {
      // 1. Test Issue Operations
      console.log("1. Testing Issue...");
      let res = await fetch(`${baseUrl}/api/cr/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueName: 'TEST_ISSUE', systemCode: 'DEV' })
      });
      let data = await res.json();
      const issueId = data.issue?.id;
      console.log("Issue Created:", issueId);

      if (issueId) {
        await fetch(`${baseUrl}/api/cr/issues/${issueId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ issueName: 'TEST_ISSUE_UPDATED' })
        });
        await fetch(`${baseUrl}/api/cr/issues/${issueId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'test cancel' })
        });
        await fetch(`${baseUrl}/api/cr/issues/${issueId}`, { method: 'DELETE' });
      }

      // 2. Test Project Operations
      console.log("2. Testing Project...");
      res = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectName: 'TEST_PROJECT',
          ownerPersonId: 1, // Assume person 1 exists
          projectStatus: 'planned',
          issueIds: []
        })
      });
      data = await res.json();
      const projectId = data.project?.id;
      console.log("Project Created:", projectId);

      if (projectId) {
        await fetch(`${baseUrl}/api/projects/${projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            projectName: 'TEST_PROJECT_UPDATED',
            ownerPersonId: 1,
            projectStatus: 'in_progress',
            issueIds: []
          })
        });
        await fetch(`${baseUrl}/api/projects/${projectId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'test cancel' })
        });
        await fetch(`${baseUrl}/api/projects/${projectId}`, { method: 'DELETE' });
      }

      // 3. Test Master Data (User)
      console.log("3. Testing Master Data...");
      res = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'TEST_USER_123', password: 'password123', role: 'USER', isActive: true })
      });
      data = await res.json();
      const userId = data.user?.id;
      console.log("User Created:", userId);

      if (userId) {
        await fetch(`${baseUrl}/api/users/${userId}/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'ADMIN' })
        });
        await fetch(`${baseUrl}/api/users/${userId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: false })
        });
        await fetch(`${baseUrl}/api/users/${userId}/password`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: 'newpassword123' })
        });
        await fetch(`${baseUrl}/api/users/${userId}`, { method: 'DELETE' });
      }

      // 4. Test Sync
      console.log("4. Testing Sync...");
      await fetch(`${baseUrl}/api/cr/sync/cr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemCodes: ['DEV'], lookbackDays: 1, syncMode: 'incremental' })
      });

      // 5. Test Auth
      console.log("5. Testing Auth (Simulated Login)...");
      await recordActivityLog({
        activityType: 'auth',
        action: 'login',
        username: 'TEST_ADMIN',
        description: 'User TEST_ADMIN logged in successfully'
      });

      // 6. Fetch Logs
      console.log("6. Fetching Audit Logs...");
      const auditRes = await fetch(`${baseUrl}/api/audit/audit-logs?pageSize=20`);
      const auditData = await auditRes.json();
      
      console.log("\n=== AUDIT LOGS RESULTS ===");
      auditData.rows.forEach((log: any) => {
        console.log(`[${log.activity_type.toUpperCase()}] ${log.action} - ${log.description}`);
      });
      
      console.log("\n=== SUMMARY ===");
      console.log(auditData.summary);

    } catch (e) {
      console.error(e);
    } finally {
      server.close();
      pool.end();
    }
  });
}

runTests().catch(console.error);
