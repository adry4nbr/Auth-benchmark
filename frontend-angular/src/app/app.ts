import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WarmupBanner } from './shared/warmup-banner/warmup-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, WarmupBanner],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('frontend-angular');
}
