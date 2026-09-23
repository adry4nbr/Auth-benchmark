import { Component, Input, OnInit, signal } from '@angular/core';
import { TableModule } from 'primeng/table';
import { AdminService, AdminUser } from '../../../core/admin/admin.service';

@Component({
  selector: 'app-users-table',
  imports: [TableModule],
  templateUrl: './users-table.html',
  styleUrl: './users-table.css',
})
export class UsersTable implements OnInit {
  @Input({ required: true }) stack!: 'nestjs' | 'springboot';

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
    this.loadUsers(page, event.rows ?? this.rowsPerPage);
  }

  private loadUsers(page: number, limit: number): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.adminService.getUsers(this.stack, page, limit).subscribe({
      next: (response) => {
        this.users.set(response.data);
        this.totalRecords.set(response.total);
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
}
