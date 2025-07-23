# Backup and Disaster Recovery Strategy

## Overview
This document outlines the comprehensive backup and disaster recovery (DR) strategy for the RepSpheres OS Backend application deployed on Render.

## Infrastructure Architecture

### Primary Infrastructure
- **Platform**: Render.com
- **Database**: Supabase (PostgreSQL)
- **File Storage**: Render ephemeral storage + cloud storage
- **External Services**: Multiple API integrations (OpenAI, Anthropic, Stripe, etc.)

### High Availability Setup
- **Multi-instance deployment**: 2 instances for load balancing
- **Health checks**: Automated health monitoring every 30 seconds
- **Auto-restart**: Automatic service restart on failure
- **Rolling deployments**: Zero-downtime updates

## Database Backup Strategy

### Supabase PostgreSQL Backups
Supabase provides automatic daily backups with point-in-time recovery:

1. **Automatic Backups**
   - Daily automated backups (retained for 7 days on free tier, 30 days on paid)
   - Continuous WAL (Write-Ahead Logging) for point-in-time recovery
   - Cross-region replication available on paid plans

2. **Manual Backup Procedures**
   ```sql
   -- Export critical tables
   pg_dump --host=your-supabase-host --port=5432 --username=postgres --dbname=postgres --table=user_subscriptions --data-only --file=user_subscriptions_backup.sql
   
   -- Full database backup
   pg_dump --host=your-supabase-host --port=5432 --username=postgres --dbname=postgres --file=full_backup.sql
   ```

3. **Backup Verification Script**
   ```bash
   #!/bin/bash
   # backup-verify.sh
   BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
   pg_dump $DATABASE_URL > $BACKUP_FILE
   
   # Verify backup integrity
   if [ $? -eq 0 ]; then
     echo "Backup successful: $BACKUP_FILE"
     # Upload to cloud storage (S3, Google Cloud, etc.)
   else
     echo "Backup failed!"
     exit 1
   fi
   ```

### Critical Data Tables Priority
1. **Tier 1 (Critical)**
   - `user_subscriptions` - User billing and access data
   - `usage_logs` - Usage tracking for billing
   - `user_registrations` - User authentication data

2. **Tier 2 (Important)**
   - `app_data` - Application-specific user data
   - `transcriptions` - Call and audio transcriptions
   - `call_records` - Communication history

3. **Tier 3 (Recoverable)**
   - `activity_log` - System activity logs
   - Cache tables - Can be regenerated

## Application Code Backup

### Git Repository Strategy
```bash
# Primary repository
git remote add origin https://github.com/username/osbackend.git

# Backup repositories
git remote add backup-github https://github.com/username/osbackend-backup.git
git remote add backup-gitlab https://gitlab.com/username/osbackend-backup.git

# Push to multiple remotes
git push origin main
git push backup-github main
git push backup-gitlab main
```

### Automated Backup Script
```javascript
// scripts/backup-automation.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

class BackupManager {
  async performFullBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = `backups/backup-${timestamp}`;
    
    try {
      // Create backup directory
      fs.mkdirSync(backupDir, { recursive: true });
      
      // 1. Database backup
      await this.backupDatabase(backupDir);
      
      // 2. Environment configuration backup
      await this.backupConfiguration(backupDir);
      
      // 3. File uploads backup
      await this.backupUploads(backupDir);
      
      // 4. Logs backup
      await this.backupLogs(backupDir);
      
      console.log(`Full backup completed: ${backupDir}`);
      return backupDir;
    } catch (error) {
      console.error('Backup failed:', error);
      throw error;
    }
  }
  
  async backupDatabase(backupDir) {
    if (!process.env.DATABASE_URL) {
      console.warn('No database URL found for backup');
      return;
    }
    
    const dbBackupFile = path.join(backupDir, 'database.sql');
    execSync(`pg_dump ${process.env.DATABASE_URL} > ${dbBackupFile}`);
  }
  
  async backupConfiguration(backupDir) {
    const configBackup = {
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      services: {
        supabase: !!process.env.SUPABASE_URL,
        openai: !!process.env.OPENAI_API_KEY,
        stripe: !!process.env.STRIPE_SECRET_KEY,
        twilio: !!process.env.TWILIO_ACCOUNT_SID
      },
      render_config: fs.readFileSync('render.yaml', 'utf8')
    };
    
    fs.writeFileSync(
      path.join(backupDir, 'configuration.json'),
      JSON.stringify(configBackup, null, 2)
    );
  }
  
  async backupUploads(backupDir) {
    const uploadsDir = 'uploads';
    if (fs.existsSync(uploadsDir)) {
      execSync(`cp -r ${uploadsDir} ${backupDir}/`);
    }
  }
  
  async backupLogs(backupDir) {
    const logsDir = 'logs';
    if (fs.existsSync(logsDir)) {
      execSync(`cp -r ${logsDir} ${backupDir}/`);
    }
  }
}

export default BackupManager;
```

## Disaster Recovery Procedures

### RTO (Recovery Time Objective): 15 minutes
### RPO (Recovery Point Objective): 24 hours

### Recovery Scenarios

#### 1. Application Crash/Restart
**Automatic Recovery**
- Render automatically restarts failed services
- Health checks detect failures within 30 seconds
- Rolling deployments prevent total service outage

**Manual Steps (if needed)**
```bash
# Force restart service
curl -X POST https://api.render.com/v1/services/YOUR_SERVICE_ID/restart \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

#### 2. Database Corruption/Loss
**Recovery Steps**
1. **Immediate Actions**
   ```bash
   # Check Supabase dashboard for backup availability
   # Restore from most recent backup
   ```

2. **Point-in-Time Recovery**
   ```sql
   -- Restore to specific timestamp
   SELECT pg_create_restore_point('pre_disaster_restore_point');
   ```

3. **Alternative Database Setup**
   ```bash
   # Set up new Supabase project
   # Restore from backup
   # Update environment variables
   ```

#### 3. Complete Service Outage
**Recovery Checklist**
- [ ] Check Render status page
- [ ] Verify database accessibility
- [ ] Check external service dependencies
- [ ] Review recent deployments
- [ ] Execute failover procedures

**Failover Steps**
1. **Deploy to backup infrastructure**
   ```yaml
   # backup-render.yaml
   services:
     - type: web
       name: spheres-backend-backup
       env: node
       region: virginia # Different region
       buildCommand: npm ci --only=production
       startCommand: node start.js
   ```

2. **Update DNS/Load Balancer**
   - Update DNS records to point to backup service
   - Implement traffic routing rules

3. **Database failover**
   ```bash
   # Switch to backup database
   export SUPABASE_URL="backup-database-url"
   export SUPABASE_KEY="backup-database-key"
   ```

#### 4. Data Center Outage
**Geographic Failover**
1. **Secondary Region Deployment**
   - Maintain standby deployment in different region
   - Automated failover using DNS health checks
   - Cross-region database replication

2. **Recovery Actions**
   ```bash
   # Activate secondary region
   ./scripts/activate-failover.sh
   
   # Update DNS
   ./scripts/update-dns-failover.sh
   
   # Verify service health
   curl https://backup-domain.com/health
   ```

## Monitoring and Alerting

### Health Monitoring
```javascript
// Enhanced health check endpoint
app.get('/health/detailed', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {}
  };
  
  // Check database connectivity
  try {
    await supabase.from('user_subscriptions').select('*').limit(1);
    health.services.database = 'healthy';
  } catch (error) {
    health.services.database = 'unhealthy';
    health.status = 'degraded';
  }
  
  // Check external APIs
  const apis = ['openai', 'stripe', 'twilio'];
  for (const api of apis) {
    try {
      await checkApiHealth(api);
      health.services[api] = 'healthy';
    } catch (error) {
      health.services[api] = 'unhealthy';
    }
  }
  
  res.json(health);
});
```

### Alerting Configuration
```javascript
// Alert conditions
const alerts = {
  database_down: {
    condition: 'database connection fails',
    severity: 'critical',
    notification: ['email', 'sms', 'slack']
  },
  high_error_rate: {
    condition: 'error rate > 5% for 5 minutes',
    severity: 'warning',
    notification: ['email', 'slack']
  },
  low_disk_space: {
    condition: 'disk usage > 90%',
    severity: 'warning',
    notification: ['email']
  }
};
```

## Recovery Testing

### Monthly DR Tests
```bash
#!/bin/bash
# dr-test.sh - Monthly disaster recovery test

echo "Starting DR test $(date)"

# 1. Test backup restoration
./scripts/test-backup-restore.sh

# 2. Test failover procedures
./scripts/test-failover.sh

# 3. Test monitoring and alerting
./scripts/test-alerts.sh

# 4. Generate test report
./scripts/generate-dr-report.sh

echo "DR test completed $(date)"
```

### Test Scenarios
1. **Database failover test** (monthly)
2. **Application failover test** (monthly)
3. **Full disaster simulation** (quarterly)
4. **Recovery time measurement** (quarterly)

## Documentation and Runbooks

### Emergency Contacts
- **Primary On-Call**: [Contact Information]
- **Secondary On-Call**: [Contact Information]
- **Database Admin**: [Supabase Support]
- **Infrastructure**: [Render Support]

### Runbook Templates
1. **Service Restart Runbook**
2. **Database Recovery Runbook**
3. **Full System Recovery Runbook**
4. **Communication Plan Template**

## Compliance and Audit

### Backup Retention Policy
- **Daily backups**: 30 days retention
- **Weekly backups**: 12 weeks retention
- **Monthly backups**: 12 months retention
- **Yearly backups**: 7 years retention

### Audit Requirements
- Monthly backup verification
- Quarterly DR test documentation
- Annual DR plan review and update
- Security audit trail maintenance

## Cost Optimization

### Backup Storage Costs
- Use lifecycle policies for old backups
- Compress backup files
- Optimize backup frequency based on data criticality

### Infrastructure Costs
- Right-size instances based on actual usage
- Use spot instances for non-critical workloads
- Implement auto-scaling for cost efficiency

## Future Improvements

### Planned Enhancements
1. **Automated failover** - Zero-touch disaster recovery
2. **Multi-cloud deployment** - Reduce vendor lock-in
3. **Real-time replication** - Reduce RPO to minutes
4. **Backup encryption** - Enhanced security
5. **Disaster recovery as code** - Infrastructure automation