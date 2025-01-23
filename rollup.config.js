import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';

export default [
    {
        input: 'build/server.js',
        output: [
            {
                file: 'dist/server.mjs',
                format: 'es'
            },
        ],
        plugins: [
            resolve(),
            commonjs(),
        ]
    },
    {
        input: 'src/service-worker.js',
        output: {
            file: 'dist/service-worker.mjs',
            format: 'es'
        },
        plugins: [
            resolve(),
            commonjs(),
        ]
    }
];