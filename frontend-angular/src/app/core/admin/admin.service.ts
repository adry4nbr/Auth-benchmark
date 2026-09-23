import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface PaginatedUsers {
  data: AdminUser[];
  total: number;
  page: number;
}

interface NestjsPagedResponse {
  data: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

interface SpringbootPagedResponse {
  data: AdminUser[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private http: HttpClient) {}

  getUsers(
    stack: 'nestjs' | 'springboot',
    page: number,
    limit: number,
  ): Observable<PaginatedUsers> {
    const baseUrl = environment.apiUrls[stack];
    return this.http
      .get<NestjsPagedResponse | SpringbootPagedResponse>(
        `${baseUrl}/admin/users?page=${page}&limit=${limit}`,
      )
      .pipe(
        map((response) =>
          'totalItems' in response
            ? { data: response.data, total: response.totalItems, page: response.currentPage }
            : { data: response.data, total: response.total, page: response.page },
        ),
      );
  }
}
