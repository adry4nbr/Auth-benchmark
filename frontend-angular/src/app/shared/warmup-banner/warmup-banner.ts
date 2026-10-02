import { Component, OnInit, computed, inject } from '@angular/core';
import { WarmupService } from '../../core/warmup/warmup.service';

@Component({
  selector: 'app-warmup-banner',
  template: `
    @if (!allReady()) {
      <div
        class="fixed bottom-4 left-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 rounded-xl border border-gray-700 bg-gray-900/95 px-4 py-3 text-sm text-gray-100 shadow-lg"
        role="status"
      >
        <p class="font-medium">Acordando os servidores gratuitos…</p>
        <p class="mt-1 text-xs text-gray-400">
          Na primeira visita isso pode levar até 1 minuto. Login e cadastro funcionam assim que cada
          servidor ficar pronto.
        </p>
        <ul class="mt-2 flex gap-4 text-xs">
          <li>{{ warmup.nestjs() === 'ready' ? '🟢' : '🟡' }} NestJS</li>
          <li>{{ warmup.springboot() === 'ready' ? '🟢' : '🟡' }} Spring Boot</li>
        </ul>
      </div>
    }
  `,
})
export class WarmupBanner implements OnInit {
  protected readonly warmup = inject(WarmupService);
  protected readonly allReady = computed(
    () => this.warmup.nestjs() === 'ready' && this.warmup.springboot() === 'ready',
  );

  ngOnInit(): void {
    this.warmup.start();
  }
}
