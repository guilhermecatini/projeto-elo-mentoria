import {config} from 'dotenv';
import {resolve} from 'node:path';
import knex from 'knex';
config({path:resolve(__dirname,'../../../.env'),quiet:true});
export const db = knex({client:'pg',connection:process.env.DATABASE_URL,pool:{min:0,max:10}});
export const migrationDb = () => knex({client:'pg',connection:process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,pool:{min:0,max:2}});
export const json = (v: unknown) => JSON.stringify(v);
