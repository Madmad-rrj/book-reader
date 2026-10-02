using BookReader.Api.Data;
using BookReader.Api.DTOs;
using BookReader.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BookReader.Api.Controllers;

[ApiController]
[Route("api/books")]
public class BooksController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<BookResponse>>> GetBooks(CancellationToken cancellationToken)
    {
        var books = await db.Books
            .AsNoTracking()
            .OrderBy(book => book.Name)
            .Select(book => new BookResponse(book.Id, book.Name))
            .ToListAsync(cancellationToken);

        return Ok(books);
    }

    [HttpPost]
    public async Task<ActionResult<BookResponse>> CreateBook(
        CreateBookRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Book name is required.");
        }

        var book = new Book { Name = request.Name.Trim() };
        db.Books.Add(book);
        await db.SaveChangesAsync(cancellationToken);

        var response = new BookResponse(book.Id, book.Name);
        return CreatedAtAction(nameof(GetBooks), response);
    }
}
