import { validator } from 'hono-openapi';
import { validationHook } from '@/lib/problem-details';

// Answers a request that fails validation with a problem document that lists
// every issue. It is `validator` with that hook as the default, so a call reads
// and infers the same way.
const failWithProblem = validationHook();

export const validate = ((target, schema, hook, options) =>
    validator(target, schema, hook ?? failWithProblem, options)) as typeof validator;
