import type {Database} from '../packages/db/client.ts';
import type {Prisma} from '../packages/db/generated/client.ts';

/** Configure the automatically-created repo in the disposable test System. */
export function repositoryFixture(db:Database,args:{data:Prisma.RepositoryUncheckedCreateInput}){
  const target=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
  if(!target||new URL(target).pathname!=='/portal_test')throw Error('Repository fixtures require portal_test');
  return db.repository.upsert({where:{systemId:args.data.systemId},create:args.data,update:args.data});
}
