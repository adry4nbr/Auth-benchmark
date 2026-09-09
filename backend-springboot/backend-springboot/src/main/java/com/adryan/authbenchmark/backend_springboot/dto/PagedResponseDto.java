package com.adryan.authbenchmark.backend_springboot.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@AllArgsConstructor
public class PagedResponseDto<T> {
    private List<T> data;
    private long totalItems;
    private int totalPages;
    private int currentPage;
}
