export class ApiError extends Error {
    statusCode: number;
    errors: any[];
    isOperational: boolean;

    constructor(
        statusCode: number,
        message: string = 'Something went wrong',
        errors: any[] = [],
        stack: string = ''
    ) {
        super(message);
        this.statusCode = statusCode;
        this.errors = errors;
        this.isOperational = true;

        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
