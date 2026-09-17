import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { PrimeTemplate } from 'primeng/api';

interface StackOption {
  name: string;
  tagline: string;
  badge: string;
  description: string;
  features: string[];
  route: string;
  available: boolean;
  accentColor: string;
  borderColor: string;
  cardBg: string;
  cardText: string;
}

@Component({
  selector: 'app-landing',
  imports: [RouterLink, Card, Button, PrimeTemplate],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  protected readonly stacks: StackOption[] = [
    {
      name: 'NestJS',
      tagline: 'Node.js · TypeScript',
      badge: 'v10 + Node 20',
      description: 'Framework progressivo para aplicações Node escaláveis com TypeScript nativo.',
      features: ['Decorators', 'Dependency Injection', 'JWT + Passport', 'TypeORM'],
      route: '/nestjs',
      available: true,
      accentColor: '#e0234e',
      borderColor: '#2a1f28',
      cardBg: '#0d0a12',
      cardText: '#ffffff',
    },
    {
      name: 'Spring Boot',
      tagline: 'Java · Maven/Gradle',
      badge: '3.x + Java 21',
      description: 'Framework enterprise para aplicações Java robustas e de alta performance.',
      features: ['Spring Security', 'OAuth2 Resource Server', 'Spring Data JPA', 'Actuator'],
      route: '/springboot',
      available: true,
      accentColor: '#6db33f',
      borderColor: '#6db33f',
      cardBg: '#ffffff',
      cardText: '#111827',
    },
    {
      name: 'Laravel',
      tagline: 'PHP · Composer',
      badge: '11.x + PHP 8.3',
      description: 'Framework PHP artesanal com elegância, simplicidade e ferramentas poderosas.',
      features: ['Sanctum / Passport', 'Laravel Socialite', 'Fortify (2FA)', 'Eloquent ORM'],
      route: '/laravel',
      available: false,
      accentColor: '#ef4444',
      borderColor: '#ef444440',
      cardBg: '#1a0a0a',
      cardText: '#ffffff',
    },
  ];
}
