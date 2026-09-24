import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { TableModule } from 'primeng/table';
import { AdminService, AdminUser } from '../../../core/admin/admin.service';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-users-table',
  imports: [TableModule, DatePipe],
  templateUrl: './users-table.html',
  styleUrl: './users-table.css',
})
export class UsersTable implements OnInit {
  @Input({ required: true }) stack!: 'nestjs' | 'springboot';
  @Input() dark = false;
  @Output() totalUsersChange = new EventEmitter<number>();

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');

  protected rowsPerPage = 5;

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadUsers(1, this.rowsPerPage);
  }

  protected onPageChange(event: { first?: number; rows?: number }): void {
    const page = Math.floor((event.first ?? 0) / (event.rows ?? this.rowsPerPage)) + 1;
    this.currentPage = page;
    this.loadUsers(page, event.rows ?? this.rowsPerPage);
  }

  private loadUsers(page: number, limit: number): void {
    this.currentPage = page;
    this.loading.set(true);
    this.errorMessage.set('');
    this.adminService.getUsers(this.stack, page, limit).subscribe({
      next: (response) => {
        this.users.set(response.data);
        this.totalRecords.set(response.total);
        this.totalUsersChange.emit(response.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(
          err.status === 403
            ? 'Você não tem permissão de administrador para ver esta lista.'
            : 'Erro ao carregar usuários.',
        );
      },
    });
  }

  protected currentPage = 1;

  protected onDelete(user: AdminUser): void {
    const confirmed = confirm(`Deletar o usuário "${user.name}"? Essa ação não pode ser desfeita.`);
    if (!confirmed) return;

    this.adminService.deleteUser(this.stack, user.id).subscribe({
      next: () => this.loadUsers(this.currentPage, this.rowsPerPage),
      error: () => {
        this.errorMessage.set('Erro ao deletar usuário.');
      },
    });
  }

  protected get tableTokens() {
    if (!this.dark) return {};
    return {
      header: {
        background: '#0a0a0f',
        color: '#9ca3af',
        borderColor: '#2a1f28',
      },
      headerCell: {
        background: '#0a0a0f',
        color: '#9ca3af',
        borderColor: '#2a1f28',
      },
      row: {
        background: '#0f0d14',
        color: '#e5e7eb',
        hoverBackground: '#1a1522',
        stripedBackground: '#161019',
      },
      bodyCell: {
        borderColor: '#2a1f28',
      },
      footer: {
        background: '#0a0a0f',
        color: '#9ca3af',
      },
    };
  }

  protected get paginatorStyle() {
    if (!this.dark) return {};
    return {
      '--p-paginator-background': '#0a0a0f',
      '--p-paginator-color': '#9ca3af',
    };
  }
}
