import { ConnectionOptions } from 'typeorm';

import { ZeroExOrderEntity } from './entities/zero_ex_order_entity';

export const defaultOrmConfig: ConnectionOptions = {
    type: 'sqlite',
    database: 'database.sqlite',
    synchronize: true,
    logging: true,
    entities: [ZeroExOrderEntity],
    cli: {
        entitiesDir: './entities',
    },
    ...(process.env.ORM_CONFIG !== undefined ? process.env.ORM_CONFIG as {} : {}),
};
