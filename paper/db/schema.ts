import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const users=sqliteTable('graph_users',{id:text('id').primaryKey(),created:integer('created').notNull()});
export const nodes=sqliteTable('graph_nodes',{owner:text('owner').notNull(),id:text('id').notNull(),data:text('data').notNull(),overrides:text('overrides').notNull().default('{}')},t=>[primaryKey({columns:[t.owner,t.id]})]);
export const edges=sqliteTable('graph_edges',{owner:text('owner').notNull(),id:text('id').notNull(),data:text('data').notNull(),deleted:integer('deleted').notNull().default(0)},t=>[primaryKey({columns:[t.owner,t.id]})]);
export const cache=sqliteTable('metadata_cache',{key:text('key').primaryKey(),data:text('data').notNull(),expires:integer('expires').notNull()});
export const limits=sqliteTable('request_limits',{key:text('key').primaryKey(),count:integer('count').notNull()});
