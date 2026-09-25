import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

declare const google: any;

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private idTokenReceived = new Subject<string>();
  private initialized = false;

  private ensureInitialized(): void {
    if (this.initialized) return;

    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response: { credential: string }) => {
        this.idTokenReceived.next(response.credential);
      },
    });

    this.initialized = true;
  }

  promptLogin(): Subject<string> {
    this.ensureInitialized();
    google.accounts.id.prompt();
    return this.idTokenReceived;
  }
}
