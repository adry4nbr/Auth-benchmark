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
  @Input() customPaginator = false;
  @Input() headerBg = '#ffffff';
  @Input() headerColor = '#111827';
  @Input() rowBg = '#ffffff';
  @Input() rowColor = '#111827';
  @Input() rowStripedBg = '#f9fafb';
  @Input() rowHoverBg = '#f3f4f6';
  @Input() borderColor = '#e5e7eb';
  @Input() paginatorBg = '#ffffff';
  @Input() paginatorColor = '#6b7280';
  @Input() deleteVariant: 'link' | 'pill' = 'link';
  @Input() deletePillBg = '#eef7e8';
  @Input() deletePillColor = '#4a8a28';
  @Input() deletePillBorder = '#c1e3ab';
  @Output() totalUsersChange = new EventEmitter<number>();

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly currentPage = signal(1);

  protected rowsPerPage = 5;

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadUsers(1, this.rowsPerPage);
  }

  protected onPageChange(event: { first?: number; rows?: number }): void {
    const page = Math.floor((event.first ?? 0) / (event.rows ?? this.rowsPerPage)) + 1;
    this.loadUsers(page, event.rows ?? this.rowsPerPage);
  }

  protected goToPrevPage(): void {
    if (this.currentPage() <= 1) return;
    this.loadUsers(this.currentPage() - 1, this.rowsPerPage);
  }

  protected goToNextPage(): void {
    const maxPage = Math.ceil(this.totalRecords() / this.rowsPerPage);
    if (this.currentPage() >= maxPage) return;
    this.loadUsers(this.currentPage() + 1, this.rowsPerPage);
  }

  protected get rangeStart(): number {
    return this.totalRecords() === 0 ? 0 : (this.currentPage() - 1) * this.rowsPerPage + 1;
  }

  protected get rangeEnd(): number {
    return Math.min(this.currentPage() * this.rowsPerPage, this.totalRecords());
  }

  // ...onDelete continua igual

  private loadUsers(page: number, limit: number): void {
    this.currentPage.set(page);
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

  protected onDelete(user: AdminUser): void {
    const confirmed = confirm(`Deletar o usuário "${user.name}"? Essa ação não pode ser desfeita.`);
    if (!confirmed) return;

    this.adminService.deleteUser(this.stack, user.id).subscribe({
      next: () => this.loadUsers(this.currentPage(), this.rowsPerPage),
      error: () => {
        this.errorMessage.set('Erro ao deletar usuário.');
      },
    });
  }

  protected get tableTokens() {
    return {
      header: { background: this.headerBg, color: this.headerColor, borderColor: this.borderColor },
      headerCell: {
        background: this.headerBg,
        color: this.headerColor,
        borderColor: this.borderColor,
      },
      row: {
        background: this.rowBg,
        color: this.rowColor,
        hoverBackground: this.rowHoverBg,
        stripedBackground: this.rowStripedBg,
      },
      bodyCell: { borderColor: this.borderColor },
      footer: { background: this.headerBg, color: this.headerColor },
    };
  }

  protected get paginatorStyle() {
    return {
      '--p-paginator-background': this.paginatorBg,
      '--p-paginator-color': this.paginatorColor,
    };
  }
}
