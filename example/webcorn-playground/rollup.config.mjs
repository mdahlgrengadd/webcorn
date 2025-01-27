import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

export default [
    {
        input: 'src/django.js',
        output: [
            {
                file: '../../docs/project_django/django.mjs',
                format: 'es'
            },
        ],
        plugins: [
            resolve(),
            commonjs(),
        ]
    },
    {
        input: 'src/fastapi.js',
        output: [
            {
                file: '../../docs/project_fastapi/fastapi.mjs',
                format: 'es'
            },
        ],
        plugins: [
            resolve(),
            commonjs(),
        ]
    },
    {
        input: 'src/flask.js',
        output: [
            {
                file: '../../docs/project_flask/flask.mjs',
                format: 'es'
            },
        ],
        plugins: [
            resolve(),
            commonjs(),
        ]
    },
    {
        input: 'src/wagtail.js',
        output: [
            {
                file: '../../docs/project_wagtail/wagtail.mjs',
                format: 'es'
            },
        ],
        plugins: [
            resolve(),
            commonjs(),
        ]
    },
    {
        input: 'src/sw.js',
        output: {
            file: '../../docs/sw.mjs',
            format: 'es'
        },
        plugins: [
            resolve(),
            commonjs(),
        ]
    }
];