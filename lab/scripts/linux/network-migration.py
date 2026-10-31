"""Replace only the owned LAB bridge; preserve containers, volumes and rollback metadata."""
from pathlib import Path
import json,os,subprocess,sys,uuid

ROOT=Path('/opt/ai-local-lab')
SERVICES={'ollama','open-webui','qwen-code','qdrant','ai-dev','jupyter'}
NAME='ai-local-lab_lab'

def run(*args):return subprocess.check_output(list(args),text=True).strip()
def inspect(kind,name):return json.loads(run('docker',kind,'inspect',name))[0]

def connect(row,network,address=None):
    args=['docker','network','connect']
    if address:args+=['--ip',address]
    for alias in row['NetworkSettings']['Networks'][NAME].get('Aliases') or []:args+=['--alias',alias]
    run(*args,network,row['Id'])

def create(config):
    args=['docker','network','create','--driver','bridge','--label','com.docker.compose.project=ai-local-lab','--label','com.docker.compose.network=lab']
    for key,flag in [('Subnet','--subnet'),('IPRange','--ip-range'),('Gateway','--gateway')]:
        if config.get(key):args+=[flag,config[key]]
    run(*args,NAME)

def migrate(settings):
    if os.geteuid()!=0 or not Path('/etc/ai-local-lab-owner').is_file():raise RuntimeError('Owned LAB and root required')
    subnet,dynamic,gateway,address=settings
    probe=subprocess.run(['docker','network','inspect',NAME],capture_output=True,text=True)
    if probe.returncode:return {'changed':False,'networkAbsent':True}
    network=json.loads(probe.stdout)[0]
    if network.get('Driver')!='bridge' or network.get('Labels',{}).get('com.docker.compose.project')!='ai-local-lab' or network.get('Labels',{}).get('com.docker.compose.network')!='lab':raise RuntimeError('Keep unowned network')
    desired={'Subnet':subnet,'IPRange':dynamic,'Gateway':gateway}
    if network.get('IPAM',{}).get('Config')==[desired]:return {'changed':False}
    if len(network['IPAM']['Config'])!=1 or network.get('Options'):raise RuntimeError('Keep custom network settings')
    rows=[]
    ids=run('docker','ps','-aq','--filter','label=com.docker.compose.project=ai-local-lab').splitlines()
    for identifier in ids:
        row=inspect('container',identifier)
        if NAME not in row['NetworkSettings']['Networks']:continue
        labels=row['Config'].get('Labels',{})
        if labels.get('com.docker.compose.project')!='ai-local-lab' or labels.get('com.docker.compose.service') not in SERVICES:raise RuntimeError('Keep unexpected attached container')
        rows.append(row)
    if set(network.get('Containers',{}))-set(row['Id'] for row in rows):raise RuntimeError('Keep foreign attached containers')
    # Read-only preflight prevents deleting the old bridge when the destination overlaps another route.
    import ipaddress
    for line in run('ip','-j','-4','route','show').splitlines():
        for route in json.loads(line):
            destination=route.get('dst','default')
            if destination!='default' and route.get('dev')!='br-'+network['Id'][:12] and ipaddress.ip_network(destination).overlaps(ipaddress.ip_network(subnet)):raise RuntimeError('LAB subnet overlaps an existing route')
    sys.path.insert(0,str(ROOT/'lib'))
    from audit_admin import administrative_operation
    with administrative_operation('LAB_NETWORK_MIGRATED',source='lab/network-migration',root=ROOT,details={'networkName':NAME,'scope':'owned-bridge-preserve-containers-and-volumes','count':len(rows)}) as operation:
        backups=ROOT/'audit/network-migrations'
        if backups.is_symlink():raise RuntimeError('Keep unexpected backup path')
        backups.mkdir(mode=0o700,exist_ok=True)
        backup=backups/(uuid.uuid4().hex+'.json')
        descriptor=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(descriptor,'w') as stream:json.dump({'network':network,'containers':rows,'desired':desired},stream)
        replaced=False
        try:
            for row in rows:
                if row['State']['Running']:run('docker','stop','--timeout','20',row['Id'])
            for row in rows:run('docker','network','disconnect',NAME,row['Id'])
            run('docker','network','rm',NAME);replaced=True
            create(desired)
            run('python3',str(ROOT/'scripts/linux/offline-network.py'),'isolate')
            for row in rows:connect(row,NAME,address if row['Config']['Labels']['com.docker.compose.service']=='ollama' else None)
            for row in rows:
                if row['State']['Running']:run('docker','start',row['Id'])
        except Exception:
            # Restore membership/addresses, preserving the original exception and private receipt.
            try:
                if replaced:
                    for row in rows:
                        current=inspect('container',row['Id'])
                        if current['State']['Running']:run('docker','stop','--timeout','20',row['Id'])
                        if NAME in current['NetworkSettings']['Networks']:run('docker','network','disconnect',NAME,row['Id'])
                    probe=subprocess.run(['docker','network','inspect',NAME],capture_output=True)
                    if probe.returncode==0:run('docker','network','rm',NAME)
                    create(network['IPAM']['Config'][0])
                    run('python3',str(ROOT/'scripts/linux/offline-network.py'),'isolate')
                for row in rows:
                    if NAME not in inspect('container',row['Id'])['NetworkSettings']['Networks']:connect(row,NAME,row['NetworkSettings']['Networks'][NAME].get('IPAddress') or None)
                    if row['State']['Running']:run('docker','start',row['Id'])
            except Exception as rollback_error:raise RuntimeError('Network migration and restoration unconfirmed; consult the private receipt') from rollback_error
            operation.result('FAILED',reasonCode='ROLLED_BACK')
            raise
        operation.result(count=len(rows))
    return {'changed':True,'containersPreserved':len(rows),'volumesDeleted':False,'address':address}
