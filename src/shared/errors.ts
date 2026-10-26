export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code?: string;
  invalidParams?: Array<{ name: string; reason: string }>;
}

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly detail: string;
  public readonly invalidParams?: Array<{ name: string; reason: string }>;

  constructor(status: number, message: string, code = 'INTERNAL_ERROR', invalidParams?: Array<{ name: string; reason: string }>) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.detail = message;
    this.invalidParams = invalidParams;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toProblemDetails(instance?: string): ProblemDetails {
    return {
      type: `https://httpstatuses.com/${this.status}`,
      title: this.name,
      status: this.status,
      detail: this.detail,
      code: this.code,
      instance,
      invalidParams: this.invalidParams,
    };
  }
}
