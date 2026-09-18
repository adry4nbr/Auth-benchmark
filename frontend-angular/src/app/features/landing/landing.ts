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
      description:
        'Framework Node.js opinativo, inspirado em Angular, com arquitetura modular baseada em decorators.',
      features: ['Decorators', 'Dependency Injection', 'JWT + Passport', 'Prisma'],
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
      description:
        'Framework Java maduro do ecossistema enterprise, com forte convenção e segurança nativa.',
      features: [
        'Spring Security',
        'Dependency Injection',
        'JJWT + Filter Chain',
        'Spring Data JPA',
      ],
      route: '/springboot',
      available: true,
      accentColor: '#6db33f',
      borderColor: '#6db33f',
      cardBg: '#ffffff',
      cardText: '#111827',
    },
    {
      name: 'Laravel',
      tagline: 'PHP · Em breve',
      badge: 'Em breve',
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
