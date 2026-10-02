using BookReader.Api.Data;
using BookReader.Api.DTOs;
using BookReader.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BookReader.Api.Controllers;

[ApiController]
public class SavedWordsController(AppDbContext db) : ControllerBase
{
    [HttpGet("api/books/{bookId:int}/saved-words")]
    public async Task<ActionResult<IReadOnlyList<SavedWordResponse>>> GetSavedWords(
        int bookId,
        CancellationToken cancellationToken)
    {
        if (!await db.Books.AnyAsync(book => book.Id == bookId, cancellationToken))
        {
            return NotFound();
        }

        var savedWords = await db.SavedWords
            .AsNoTracking()
            .Where(savedWord => savedWord.BookId == bookId)
            .OrderByDescending(savedWord => savedWord.CreatedAt)
            .Select(savedWord => new SavedWordResponse(
                savedWord.Id,
                savedWord.BookId,
                savedWord.Original,
                savedWord.Translation,
                savedWord.CreatedAt))
            .ToListAsync(cancellationToken);

        return Ok(savedWords);
    }

    [HttpPost("api/books/{bookId:int}/saved-words")]
    public async Task<ActionResult<SavedWordResponse>> CreateSavedWord(
        int bookId,
        CreateSavedWordRequest request,
        CancellationToken cancellationToken)
    {
        if (!await db.Books.AnyAsync(book => book.Id == bookId, cancellationToken))
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(request.Original) || string.IsNullOrWhiteSpace(request.Translation))
        {
            return BadRequest("Original and translation are required.");
        }

        var savedWord = new SavedWord
        {
            BookId = bookId,
            Original = request.Original.Trim(),
            Translation = request.Translation.Trim(),
            CreatedAt = DateTime.UtcNow,
        };

        db.SavedWords.Add(savedWord);
        await db.SaveChangesAsync(cancellationToken);

        var response = new SavedWordResponse(
            savedWord.Id,
            savedWord.BookId,
            savedWord.Original,
            savedWord.Translation,
            savedWord.CreatedAt);

        return Created($"/api/books/{bookId}/saved-words", response);
    }

    [HttpDelete("api/saved-words/{id:int}")]
    public async Task<IActionResult> DeleteSavedWord(int id, CancellationToken cancellationToken)
    {
        var savedWord = await db.SavedWords.FindAsync([id], cancellationToken);
        if (savedWord is null)
        {
            return NotFound();
        }

        db.SavedWords.Remove(savedWord);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}
