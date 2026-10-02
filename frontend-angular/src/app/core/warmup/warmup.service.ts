import { Injectable, signal, WritableSignal } from '@angular/core';
import { environment } from '../../../environments/environment';

export type WarmupStatus = 'waking' | 'ready';

@Injectable({ providedIn: 'root' })
export class WarmupService {
  readonly nestjs = signal<WarmupStatus>('waking');
  readonly springboot = signal<WarmupStatus>('waking');
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    // Em desenvolvimento os backends locais não dormem.
    if (!environment.production) {
      this.nestjs.set('ready');
      this.springboot.set('ready');
      return;
    }

    this.ping(environment.apiUrls.nestjs, this.nestjs);
    this.ping(environment.apiUrls.springboot, this.springboot);
  }

  private ping(apiUrl: string, status: WritableSignal<WarmupStatus>): void {
    const attempt = () => {
      fetch(`${apiUrl}/`, { cache: 'no-store' })
        .then(() => status.set('ready'))
        .catch(() => setTimeout(attempt, 3000));
    };
    attempt();
  }
}
